import http from 'k6/http';
import { scenario } from 'k6/execution';
import { API, NODE_ID } from './lib/config.js';
import { createUser, performRead } from './lib/api.js';
import { probeHitRate } from './lib/probe.js';

/**
 * A 10-second, 10 req/s rehearsal of load-test.js over the same code paths.
 *
 * Run it on every VM before the real thing: a wrong BASE_URL, an unmigrated
 * database or a MAX_ID that matches nothing fails here in seconds, rather than
 * producing a full load run whose reads were all misses.
 */
export const options = {
  scenarios: {
    reads: {
      executor: 'constant-arrival-rate',
      exec: 'read',
      rate: 7,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 5,
      maxVUs: 20,
      tags: { kind: 'read' },
    },
    writes: {
      executor: 'constant-arrival-rate',
      exec: 'write',
      rate: 3,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 5,
      maxVUs: 20,
      tags: { kind: 'write' },
    },
  },
  discardResponseBodies: true,
  setupTimeout: '120s',
  thresholds: {
    // A smoke test is a correctness check, so nothing may fault.
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    // Unlike the load test, this one insists that reads actually find rows --
    // that is the point of running it. Override with -e MIX_BY_ID=0 if you are
    // deliberately pointing at an empty table.
    read_id_hit_rate: ['rate>0'],
  },
};

export function setup() {
  const ping = http.get(`${API}/users/1`, { responseType: 'none' });
  if (ping.status !== 200 && ping.status !== 404) {
    throw new Error(`API is not reachable at ${API} (status ${ping.status}).`);
  }

  const nodeId = NODE_ID || `smoke${Math.random().toString(36).slice(2, 8)}`;
  probeHitRate();

  return { nodeId, runId: `${Date.now()}` };
}

export function read() {
  performRead();
}

export function write(data) {
  createUser(
    `smoke-${data.nodeId}-${data.runId}-${scenario.iterationInTest}@loadtest.local`,
    'Smoke',
    'User',
  );
}
