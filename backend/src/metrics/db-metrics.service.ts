import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Gauge, Histogram } from '@prometheus-io/client';
import { Knex } from 'knex';
import { KNEX_READER, KNEX_WRITER } from '../database/knex.constants';
import { MetricsService } from './metrics.service';

interface KnexQueryEvent {
  __knexQueryUid?: string;
  sql?: string;
}

interface TarnPool {
  numUsed(): number;
  numFree(): number;
  numPendingAcquires(): number;
  numPendingCreates(): number;
}

const KNOWN_OPERATIONS = new Set(['select', 'insert', 'update', 'delete', 'begin', 'commit', 'rollback']);

const operationOf = (sql?: string): string => {
  const first = sql?.trim().split(/\s+/, 1)[0]?.toLowerCase();
  return first && KNOWN_OPERATIONS.has(first) ? first : 'other';
};

const MAX_TRACKED_QUERIES = 10_000;

type Role = 'writer' | 'reader';

@Injectable()
export class DbMetricsService implements OnModuleInit {
  private readonly queryDuration: Histogram<'role' | 'operation' | 'result'>;
  private readonly startedAt = new Map<string, bigint>();
  private readonly connections: ReadonlyArray<[Role, Knex]>;

  constructor(
    @Inject(KNEX_WRITER) writer: Knex,
    @Inject(KNEX_READER) reader: Knex,
    private readonly metrics: MetricsService,
  ) {
    this.connections = [
      ['writer', writer],
      ['reader', reader],
    ];

    this.queryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'PostgreSQL query latency in seconds.',
      labelNames: ['role', 'operation', 'result'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.metrics.registry],
    });
  }

  onModuleInit(): void {
    const connections = this.connections;

    new Gauge({
      name: 'db_pool_connections',
      help: 'Knex/tarn connection pool state.',
      labelNames: ['role', 'state'],
      registers: [this.metrics.registry],
      collect() {
        for (const [role, knex] of connections) {
          const pool = (knex.client as { pool?: TarnPool } | undefined)?.pool;
          if (!pool) {
            continue;
          }
          this.set({ role, state: 'used' }, pool.numUsed());
          this.set({ role, state: 'free' }, pool.numFree());
          this.set({ role, state: 'pending_acquires' }, pool.numPendingAcquires());
          this.set({ role, state: 'pending_creates' }, pool.numPendingCreates());
        }
      },
    });

    for (const [role, knex] of this.connections) {
      knex.on('query', (query: KnexQueryEvent) => {
        if (!query?.__knexQueryUid) {
          return;
        }
        if (this.startedAt.size >= MAX_TRACKED_QUERIES) {
          this.startedAt.clear();
        }
        this.startedAt.set(query.__knexQueryUid, process.hrtime.bigint());
      });

      knex.on('query-response', (_response: unknown, query: KnexQueryEvent) => {
        this.observe(role, query, 'success');
      });

      knex.on('query-error', (_error: unknown, query: KnexQueryEvent) => {
        this.observe(role, query, 'error');
      });
    }
  }

  private observe(role: Role, query: KnexQueryEvent, result: 'success' | 'error'): void {
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
      { role, operation: operationOf(query.sql), result },
      Number(process.hrtime.bigint() - startedAt) / 1e9,
    );
  }
}
