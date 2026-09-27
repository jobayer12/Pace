import http from 'k6/http';
import { scenario } from 'k6/execution';
import {
  API,
  DURATION,
  MODE,
  NODE_ID,
  READ_MIX,
  READ_MIX_TOTAL,
  READ_RATE,
  READ_VUS,
  SUMMARY_FILE,
  TOTAL_RATE,
  VUS,
  WARMUP,
  WARMUP_ENABLED,
  WARMUP_RATE,
  WRITE_RATE,
  WRITE_VUS,
  vusFor,
} from './lib/config.js';
import { createUser, performRead } from './lib/api.js';
import { probeHitRate } from './lib/probe.js';
import { SUMMARY_TREND_STATS, makeSummary } from './lib/summary.js';

if (MODE !== 'rate' && MODE !== 'max') {
  throw new Error(`MODE must be "rate" or "max", got "${MODE}".`);
}

const measuredStart = WARMUP_ENABLED ? WARMUP : '0s';

function measuredScenario(exec, rate, vus) {
  if (MODE === 'max') {
    return {
      executor: 'constant-vus',
      exec,
      vus,
      duration: DURATION,
      startTime: measuredStart,
      gracefulStop: '5s',
    };
  }
  return {
    executor: 'constant-arrival-rate',
    exec,
    rate,
    timeUnit: '1s',
    duration: DURATION,
    ...vusFor(rate),
    startTime: measuredStart,
    gracefulStop: '5s',
  };
}

const scenarios = {
  reads: measuredScenario('read', READ_RATE, READ_VUS),
};
if ((MODE === 'max' && WRITE_VUS > 0) || (MODE === 'rate' && WRITE_RATE > 0)) {
  scenarios.writes = measuredScenario('write', WRITE_RATE, WRITE_VUS);
}
if (WARMUP_ENABLED) {
  scenarios.warmup = {
    executor: 'constant-arrival-rate',
    exec: 'warmup',
    rate: WARMUP_RATE,
    timeUnit: '1s',
    duration: WARMUP,
    preAllocatedVUs: 50,
    maxVUs: 200,
    startTime: '0s',
  };
}

export const options = {
  scenarios,
  discardResponseBodies: true,
  setupTimeout: '120s',
  summaryTrendStats: SUMMARY_TREND_STATS,
  // No pass/fail thresholds: this run only measures response time and req/s.
};

const TARGET =
  MODE === 'max'
    ? `${VUS} VUs, no pause (${READ_VUS} read / ${WRITE_VUS} write)`
    : `${TOTAL_RATE} req/s target (${READ_RATE} read / ${WRITE_RATE} write)`;

export function setup() {
  const ping = http.get(`${API}/users/1`, { responseType: 'none' });
  if (ping.status === 0 || ping.status >= 500) {
    throw new Error(
      `API is not reachable at ${API} (status ${ping.status || ping.error}). Start the backend first.`,
    );
  }
  if (READ_MIX_TOTAL <= 0) {
    throw new Error('MIX_BY_ID, MIX_BY_EMAIL and MIX_LIST are all zero; set at least one above zero.');
  }

  const nodeId = NODE_ID || `n${Math.random().toString(36).slice(2, 8)}`;
  console.log(
    `node ${nodeId} | mode ${MODE} | ${TARGET} | read mix id/email/list = ` +
      `${READ_MIX.byId}/${READ_MIX.byEmail}/${READ_MIX.list}`,
  );
  probeHitRate();

  return { nodeId, runId: `${Date.now()}` };
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

export function handleSummary(data) {
  return makeSummary(data, { mode: MODE, target: TARGET, duration: DURATION }, SUMMARY_FILE);
}
