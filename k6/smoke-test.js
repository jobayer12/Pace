import http from 'k6/http';
import { scenario } from 'k6/execution';
import { API, NODE_ID } from './lib/config.js';
import { createUser, performRead } from './lib/api.js';
import { probeHitRate } from './lib/probe.js';
import { SUMMARY_TREND_STATS, makeSummary } from './lib/summary.js';

// Quick 10 req/s rehearsal over the same code paths as load-test.js.
const DURATION = '10s';

export const options = {
  scenarios: {
    reads: {
      executor: 'constant-arrival-rate',
      exec: 'read',
      rate: 7,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 20,
    },
    writes: {
      executor: 'constant-arrival-rate',
      exec: 'write',
      rate: 3,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 5,
      maxVUs: 20,
    },
  },
  discardResponseBodies: true,
  setupTimeout: '120s',
  summaryTrendStats: SUMMARY_TREND_STATS,
};

export function setup() {
  const ping = http.get(`${API}/users/1`, { responseType: 'none' });
  if (ping.status === 0 || ping.status >= 500) {
    throw new Error(`API is not reachable at ${API} (status ${ping.status || ping.error}).`);
  }
  probeHitRate();
  return { nodeId: NODE_ID || `smoke${Math.random().toString(36).slice(2, 8)}`, runId: `${Date.now()}` };
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

export function handleSummary(data) {
  return makeSummary(data, { mode: 'smoke', target: '10 req/s', duration: DURATION }, null);
}
