import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Gauge, Histogram } from '@prometheus-io/client';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/knex.constants';
import { MetricsService } from './metrics.service';

interface KnexQueryEvent {
  __knexQueryUid?: string;
  sql?: string;
}

/** The tarn pool behind knex.client.pool. */
interface TarnPool {
  numUsed(): number;
  numFree(): number;
  numPendingAcquires(): number;
  numPendingCreates(): number;
}

// Keeping the `operation` label to a known set stops a malformed or unusual
// statement from inventing new label values.
const KNOWN_OPERATIONS = new Set(['select', 'insert', 'update', 'delete', 'begin', 'commit', 'rollback']);

const operationOf = (sql?: string): string => {
  const first = sql?.trim().split(/\s+/, 1)[0]?.toLowerCase();
  return first && KNOWN_OPERATIONS.has(first) ? first : 'other';
};

/**
 * Upper bound on in-flight query timers. A query always emits either
 * 'query-response' or 'query-error', so this should never be reached; it is a
 * backstop so that a driver-level edge case cannot grow the map without limit
 * over a long load test.
 */
const MAX_TRACKED_QUERIES = 10_000;

@Injectable()
export class DbMetricsService implements OnModuleInit {
  private readonly queryDuration: Histogram<'operation' | 'result'>;
  private readonly startedAt = new Map<string, bigint>();

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly metrics: MetricsService,
  ) {
    this.queryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'PostgreSQL query latency in seconds.',
      labelNames: ['operation', 'result'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.metrics.registry],
    });

    const poolOf = (): TarnPool | undefined =>
      (this.knex.client as { pool?: TarnPool } | undefined)?.pool;

    // The pool is read at scrape time via `collect` rather than tracked
    // incrementally, so the reported value is always the pool's real state and
    // cannot drift out of sync with it.
    //
    // `pending_acquires` is the number to watch during a load test: a non-zero
    // value means requests are queueing for a connection, i.e. the pool -- not
    // the database -- is the bottleneck.
    new Gauge({
      name: 'db_pool_connections',
      help: 'Knex/tarn connection pool state.',
      labelNames: ['state'],
      registers: [this.metrics.registry],
      collect() {
        const pool = poolOf();
        if (!pool) {
          return;
        }
        this.set({ state: 'used' }, pool.numUsed());
        this.set({ state: 'free' }, pool.numFree());
        this.set({ state: 'pending_acquires' }, pool.numPendingAcquires());
        this.set({ state: 'pending_creates' }, pool.numPendingCreates());
      },
    });
  }

  onModuleInit(): void {
    this.knex.on('query', (query: KnexQueryEvent) => {
      if (!query?.__knexQueryUid) {
        return;
      }
      if (this.startedAt.size >= MAX_TRACKED_QUERIES) {
        this.startedAt.clear();
      }
      this.startedAt.set(query.__knexQueryUid, process.hrtime.bigint());
    });

    this.knex.on('query-response', (_response: unknown, query: KnexQueryEvent) => {
      this.observe(query, 'success');
    });

    this.knex.on('query-error', (_error: unknown, query: KnexQueryEvent) => {
      this.observe(query, 'error');
    });
  }

  private observe(query: KnexQueryEvent, result: 'success' | 'error'): void {
    const uid = query?.__knexQueryUid;
    if (!uid) {
      return;
    }

    const startedAt = this.startedAt.get(uid);
    if (startedAt === undefined) {
      return;
    }
    this.startedAt.delete(uid);

    this.queryDuration.observe(
      { operation: operationOf(query.sql), result },
      Number(process.hrtime.bigint() - startedAt) / 1e9,
    );
  }
}
