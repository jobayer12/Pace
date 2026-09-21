import http from 'k6/http';
import { scenario } from 'k6/execution';
import {
  API,
  DURATION,
  EMAIL_TEMPLATE,
  MAX_ID,
  MIN_ID,
  NODE_ID,
  READ_MIX,
  READ_RATE,
  TOTAL_RATE,
  WARMUP,
  WARMUP_ENABLED,
  WARMUP_RATE,
  WRITE_RATE,
  vusFor,
} from './lib/config.js';
import { createUser, performRead } from './lib/api.js';
import { probeHitRate } from './lib/probe.js';

// The measured scenarios only start once the warm-up phase has finished.
const measuredStart = WARMUP_ENABLED ? WARMUP : '0s';

// Reads and writes are separate scenarios rather than a random branch inside
// one, so each gets an exact arrival rate (70/30 by default) and its own
// latency thresholds, instead of a split that only holds on average.
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

export const options = {
  scenarios,

  // Only status codes are asserted, so parsing and retaining the response
  // bodies would just be load-generator overhead competing with the test.
  discardResponseBodies: true,

  setupTimeout: '120s',

  thresholds: {
    // The headline question -- did this generator actually sustain its target
    // rate? An arrival-rate executor drops an iteration whenever no VU is free
    // to run it, so a non-zero count means the run did NOT apply the requested
    // req/s, and the latency figures describe a lighter load than asked for.
    // Treat any latency result reported with dropped iterations as invalid.
    dropped_iterations: ['count<1'],

    // 404 is an expected outcome for a random id (see lib/api.js), so these
    // cover genuine faults only: 5xx, timeouts, connection errors.
    'http_req_failed{kind:read}': ['rate<0.01'],
    'http_req_failed{kind:write}': ['rate<0.01'],
    'http_req_duration{kind:read}': ['p(95)<250', 'p(99)<500'],
    'http_req_duration{kind:write}': ['p(95)<400', 'p(99)<800'],
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const ping = http.get(`${API}/users/1`, { responseType: 'none' });
  if (ping.status !== 200 && ping.status !== 404) {
    throw new Error(
      `API is not reachable at ${API} (status ${ping.status}). Start the backend first.`,
    );
  }

  // Unique per generator. Two VMs generating the same address would collide on
  // the unique index and report a 409 that looks like a server fault.
  const nodeId = NODE_ID || `n${Math.random().toString(36).slice(2, 8)}`;
  const runId = `${Date.now()}`;

  console.log(
    `node ${nodeId} | target ${TOTAL_RATE} req/s = ${READ_RATE} read + ${WRITE_RATE} write ` +
      `| read mix id/email/list = ${READ_MIX.byId}/${READ_MIX.byEmail}/${READ_MIX.list}`,
  );
  if (!NODE_ID) {
    console.warn(
      `NODE_ID was not set; using "${nodeId}". Set -e NODE_ID=vm1 (unique per VM) when running ` +
        `on several machines.`,
    );
  }
  if (READ_MIX.list > 0) {
    console.warn(
      `MIX_LIST=${READ_MIX.list}: GET /users runs SELECT count(*) on every call, a full table ` +
        `scan (~1.7s on 50M rows). Expect this endpoint, not the API, to dominate the results.`,
    );
  }

  probeHitRate();

  return { nodeId, runId, emailTemplate: EMAIL_TEMPLATE, minId: MIN_ID, maxId: MAX_ID };
}

/**
 * Unique per generator, per run and per iteration, so a 409 is always a real
 * defect rather than two VMs colliding.
 */
const uniqueEmail = (prefix, data) =>
  `${prefix}-${data.nodeId}-${data.runId}-${scenario.iterationInTest}@loadtest.local`;

export function read() {
  performRead();
}

export function write(data) {
  createUser(uniqueEmail('load', data), 'Load', `User${scenario.iterationInTest}`);
}

/** Exercises both paths, so the write path is warm too and not just reads. */
export function warmup(data) {
  performRead();
  createUser(uniqueEmail('warmup', data), 'Warmup', 'User');
}
