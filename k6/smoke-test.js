import http from 'k6/http';
import { scenario } from 'k6/execution';
import { API, NODE_ID, READ_MIX } from './lib/config.js';
import { createUser, performRead } from './lib/api.js';
import { probeHitRate, probeListShape } from './lib/probe.js';

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
  discardResponseBodies: false,
  setupTimeout: '120s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
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
  if (READ_MIX.list > 0) {
    probeListShape();
  }

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
