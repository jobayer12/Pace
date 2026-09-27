import { ENDPOINTS } from './api.js';
import { durationSeconds } from './config.js';

const TREND_STATS = ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'];
export const SUMMARY_TREND_STATS = TREND_STATS;

const metric = (data, name) => (data.metrics[name] ? data.metrics[name].values : null);
const count = (data, name) => (metric(data, name) ? metric(data, name).count : 0);

const ms = (v) => (v === undefined || v === null ? '-' : `${v.toFixed(2)}ms`);
const num = (v, digits = 0) => Number(v).toFixed(digits);
const pct = (part, whole) => (whole > 0 ? `${((part / whole) * 100).toFixed(2)}%` : '-');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function latency(values) {
  const out = {};
  for (const stat of TREND_STATS) out[stat] = values ? values[stat] : null;
  return out;
}

// Builds the numbers once so the console report and the JSON file agree.
function buildReport(data, meta) {
  const seconds = durationSeconds(meta.duration);
  const total = count(data, 'api_requests');
  const found = count(data, 'api_found');
  const notFound = count(data, 'api_not_found');
  const errors = count(data, 'api_errors');
  const success = found + notFound;

  const endpoints = {};
  for (const [key, label] of Object.entries(ENDPOINTS)) {
    const values = metric(data, `api_duration_${key}`);
    const n = count(data, `api_requests_${key}`);
    if (n === 0) continue;
    endpoints[label] = {
      requests: n,
      req_per_sec: seconds > 0 ? n / seconds : 0,
      errors: count(data, `api_errors_${key}`),
      latency_ms: latency(values),
    };
  }

  return {
    mode: meta.mode,
    target: meta.target,
    measured_seconds: seconds,
    requests: {
      total,
      found_2xx: found,
      not_found_404: notFound,
      errors,
      success_rate: total > 0 ? success / total : 0,
    },
    throughput: {
      req_per_sec: seconds > 0 ? total / seconds : 0,
      successful_req_per_sec: seconds > 0 ? success / seconds : 0,
    },
    latency_ms: latency(metric(data, 'api_duration')),
    endpoints,
    dropped_iterations: count(data, 'dropped_iterations'),
  };
}

function toText(r) {
  const lines = [];
  const line = (s = '') => lines.push(s);

  line();
  line('================ API LOAD TEST RESULT ================');
  line(`mode              ${r.mode}  (${r.target})`);
  line(`measured window   ${r.measured_seconds}s`);
  line();
  line('THROUGHPUT');
  line(`  requests/sec          ${num(r.throughput.req_per_sec, 1)}`);
  line(`  successful req/sec    ${num(r.throughput.successful_req_per_sec, 1)}   (200/201/404)`);
  line();
  line('REQUESTS');
  line(`  total                 ${r.requests.total}`);
  line(`  found (200/201)       ${r.requests.found_2xx}  ${pct(r.requests.found_2xx, r.requests.total)}`);
  line(
    `  not found (404)       ${r.requests.not_found_404}  ${pct(r.requests.not_found_404, r.requests.total)}` +
      '   <- no row in DB, not an error',
  );
  line(`  errors                ${r.requests.errors}  ${pct(r.requests.errors, r.requests.total)}`);
  line();
  line('RESPONSE TIME (all endpoints)');
  for (const stat of TREND_STATS) line(`  ${pad(stat, 8)}${lpad(ms(r.latency_ms[stat]), 14)}`);
  line();
  line('PER ENDPOINT');
  line(
    `  ${pad('endpoint', 26)}${lpad('reqs', 9)}${lpad('req/s', 10)}${lpad('avg', 11)}` +
      `${lpad('p95', 11)}${lpad('p99', 11)}${lpad('errors', 8)}`,
  );
  for (const [label, e] of Object.entries(r.endpoints)) {
    line(
      `  ${pad(label, 26)}${lpad(e.requests, 9)}${lpad(num(e.req_per_sec, 1), 10)}` +
        `${lpad(ms(e.latency_ms.avg), 11)}${lpad(ms(e.latency_ms['p(95)']), 11)}` +
        `${lpad(ms(e.latency_ms['p(99)']), 11)}${lpad(e.errors, 8)}`,
    );
  }

  // In max mode only the warm-up uses an arrival rate, so any drops happened
  // there and say nothing about the measured window.
  if (r.dropped_iterations > 0 && r.mode === 'max') {
    line();
    line(`NOTE: ${r.dropped_iterations} warm-up requests were dropped; the measured window is unaffected.`);
  } else if (r.dropped_iterations > 0) {
    line();
    line(
      `NOTE: ${r.dropped_iterations} requests could not be started on time (dropped_iterations).`,
    );
    line('      The API could not keep up with the target rate, or k6 ran out of VUs;');
    line('      "requests/sec" above is what was actually achieved.');
  }
  line('======================================================');
  line();
  return lines.join('\n');
}

export function makeSummary(data, meta, file) {
  const report = buildReport(data, meta);
  const out = { stdout: toText(report) };
  if (file) out[file] = JSON.stringify(report, null, 2);
  return out;
}
