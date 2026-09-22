import http from 'k6/http';
import { scenario } from 'k6/execution';
import {
  API,
  DURATION,
  EMAIL_TEMPLATE,
  LIST_LIMIT,
  LIST_MAX_PAGE,
  MAX_ID,
  MIN_ID,
  NODE_ID,
  READ_MIX,
  READ_MIX_TOTAL,
  READ_RATE,
  TOTAL_RATE,
  WARMUP,
  WARMUP_ENABLED,
  WARMUP_RATE,
  WRITE_RATE,
  vusFor,
} from './lib/config.js';
import { createUser, performRead } from './lib/api.js';
import { probeHitRate, probeListShape } from './lib/probe.js';

const measuredStart = WARMUP_ENABLED ? WARMUP : '0s';

const scenarios = {
  reads: {
    executor: 'constant-arrival-rate',
    exec: 'read',
    rate: READ_RATE,
    timeUnit: '1s',
    duration: DURATION,
    ...vusFor(READ_RATE),
    tags: { kind: 'read' },
    gracefulStop: '15s',
    startTime: measuredStart,
  },
  writes: {
    executor: 'constant-arrival-rate',
    exec: 'write',
    rate: WRITE_RATE,
    timeUnit: '1s',
    duration: DURATION,
    ...vusFor(WRITE_RATE),
    tags: { kind: 'write' },
    gracefulStop: '15s',
    startTime: measuredStart,
  },
};

if (WARMUP_ENABLED) {
  scenarios.warmup = {
    executor: 'constant-arrival-rate',
    exec: 'warmup',
    rate: WARMUP_RATE,
    timeUnit: '1s',
    duration: WARMUP,
    preAllocatedVUs: 50,
    maxVUs: 200,
    tags: { kind: 'warmup' },
    startTime: '0s',
  };
}

const thresholds = {
  dropped_iterations: ['count<1'],
  'http_req_failed{kind:read}': ['rate<0.01'],
  'http_req_failed{kind:write}': ['rate<0.01'],
  'http_req_duration{kind:read}': ['p(95)<250', 'p(99)<500'],
  'http_req_duration{kind:write}': ['p(95)<400', 'p(99)<800'],
  checks: ['rate>0.99'],
};
if (READ_MIX.list > 0) {
  thresholds['http_req_duration{name:GET /users}'] = ['p(95)<300', 'p(99)<600'];
  thresholds['http_req_failed{name:GET /users}'] = ['rate<0.01'];
}

export const options = {
  scenarios,

  discardResponseBodies: true,

  setupTimeout: '120s',

  thresholds,
};

export function setup() {
  const ping = http.get(`${API}/users/1`, { responseType: 'none' });
  if (ping.status !== 200 && ping.status !== 404) {
    throw new Error(
      `API is not reachable at ${API} (status ${ping.status}). Start the backend first.`,
    );
  }
  const nodeId = NODE_ID || `n${Math.random().toString(36).slice(2, 8)}`;
  const runId = `${Date.now()}`;

  console.log(
    `node ${nodeId} | target ${TOTAL_RATE} req/s = ${READ_RATE} read + ${WRITE_RATE} write ` +
      `| read mix id/email/list = ${READ_MIX.byId}/${READ_MIX.byEmail}/${READ_MIX.list}` +
      (READ_MIX_TOTAL === 100 ? '' : ` of ${READ_MIX_TOTAL}`),
  );
  if (!NODE_ID) {
    console.warn(
      `NODE_ID was not set; using "${nodeId}". Set -e NODE_ID=vm1 (unique per VM) when running ` +
        `on several machines.`,
    );
  }
  if (READ_MIX_TOTAL <= 0) {
    throw new Error(
      'MIX_BY_ID, MIX_BY_EMAIL and MIX_LIST are all zero -- there is no read endpoint left to ' +
        'call. Set at least one above zero.',
    );
  }

  probeHitRate();

  if (READ_MIX.list > 0) {
    console.log(`list reads: pages 1..${LIST_MAX_PAGE} at limit=${LIST_LIMIT}`);
    probeListShape();
  }

  return { nodeId, runId, emailTemplate: EMAIL_TEMPLATE, minId: MIN_ID, maxId: MAX_ID };
}
const uniqueEmail = (prefix, data) =>
  `${prefix}-${data.nodeId}-${data.runId}-${scenario.iterationInTest}@loadtest.local`;

export function read() {
  performRead();
}

export function write(data) {
  createUser(uniqueEmail('load', data), 'Load', `User${scenario.iterationInTest}`);
}
export function warmup(data) {
  performRead();
  createUser(uniqueEmail('warmup', data), 'Warmup', 'User');
}
