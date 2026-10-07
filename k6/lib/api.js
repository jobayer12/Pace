import http from 'k6/http';
import { scenario } from 'k6/execution';
import { Counter, Rate, Trend } from 'k6/metrics';
import {
  API,
  LIST_LIMIT,
  READ_MIX,
  READ_MIX_TOTAL,
  SLOW_MS,
  emailForId,
  randomId,
  randomPage,
} from './config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// A 404 means the random id/email is not in the database. That is a normal
// answer from the API, not a failure, so k6 must not count it in http_req_failed.
http.setResponseCallback(http.expectedStatuses(200, 201, 404));

// Endpoint key -> label used in the report and as the request's `name` tag.
export const ENDPOINTS = {
  by_id: 'GET /users/:id',
  by_email: 'GET /users/email/:email',
  list: 'GET /users',
  create: 'POST /users',
};

// Everything below is recorded for measured traffic only (warm-up is skipped).
export const apiDuration = new Trend('api_duration', true);
export const apiRequests = new Counter('api_requests');
// Status counters count every response with that status, fast or slow.
export const apiStatus200 = new Counter('api_status_200');
export const apiStatus201 = new Counter('api_status_201');
export const apiStatus404 = new Counter('api_status_404');
export const apiStatus4xx = new Counter('api_status_4xx');
export const apiStatus5xx = new Counter('api_status_5xx');
// Status 0: timeout, refused, reset -- the API never answered.
export const apiNoResponse = new Counter('api_no_response');
// Anything else (1xx/3xx); not expected from this API.
export const apiStatusOther = new Counter('api_status_other');
export const apiErrors = new Counter('api_errors');
// Good status (200/201/404) but slower than SLOW_MS. Still a success, reported
// on its own line so slow-but-answered requests stay visible.
export const apiSlow = new Counter('api_slow');
export const apiSuccess = new Rate('api_success');

const endpointDuration = {};
const endpointRequests = {};
const endpointFailed = {};
const endpointSlow = {};
for (const key of Object.keys(ENDPOINTS)) {
  endpointDuration[key] = new Trend(`api_duration_${key}`, true);
  endpointRequests[key] = new Counter(`api_requests_${key}`);
  endpointFailed[key] = new Counter(`api_errors_${key}`);
  endpointSlow[key] = new Counter(`api_slow_${key}`);
}

// One sample of each kind per VU is enough to see what is going wrong.
const errorLog = { error: 0, slow: 0 };

function record(key, res) {
  if (scenario.name === 'warmup') return res;

  const duration = res.timings.duration;
  const goodStatus = res.status === 200 || res.status === 201 || res.status === 404;
  const slow = goodStatus && duration > SLOW_MS;

  apiRequests.add(1);
  apiDuration.add(duration);
  endpointDuration[key].add(duration);
  endpointRequests[key].add(1);
  apiSuccess.add(goodStatus);

  if (!goodStatus) {
    apiErrors.add(1);
    endpointFailed[key].add(1);
    if (res.status === 0) apiNoResponse.add(1);
    else if (res.status >= 500) apiStatus5xx.add(1);
    else if (res.status >= 400) apiStatus4xx.add(1);
    else apiStatusOther.add(1);
    if (errorLog.error < 1) {
      errorLog.error += 1;
      console.warn(`${ENDPOINTS[key]} -> ${res.status || res.error} after ${duration.toFixed(0)}ms`);
    }
    return res;
  }

  if (res.status === 200) apiStatus200.add(1);
  else if (res.status === 201) apiStatus201.add(1);
  else apiStatus404.add(1);

  if (slow) {
    apiSlow.add(1);
    endpointSlow[key].add(1);
    if (errorLog.slow < 1) {
      errorLog.slow += 1;
      console.warn(`${ENDPOINTS[key]} -> ${res.status} but took ${duration.toFixed(0)}ms (> ${SLOW_MS}ms)`);
    }
  }
  return res;
}

const params = (key, kind) => ({ tags: { name: ENDPOINTS[key], kind } });

export function getUserById(id) {
  return record('by_id', http.get(`${API}/users/${id}`, params('by_id', 'read')));
}

export function getUserByEmail(email) {
  return record(
    'by_email',
    http.get(`${API}/users/email/${encodeURIComponent(email)}`, params('by_email', 'read')),
  );
}

export function listUsers(page, limit) {
  return record('list', http.get(`${API}/users?page=${page}&limit=${limit}`, params('list', 'read')));
}

export function createUser(email, firstName, lastName) {
  const body = JSON.stringify({ email, firstName, lastName });
  return record(
    'create',
    http.post(`${API}/users`, body, { headers: JSON_HEADERS, ...params('create', 'write') }),
  );
}

export function performRead() {
  const roll = Math.random() * READ_MIX_TOTAL;

  if (roll < READ_MIX.byId) {
    return getUserById(randomId());
  }

  if (roll < READ_MIX.byId + READ_MIX.byEmail) {
    return getUserByEmail(emailForId(randomId()));
  }

  return listUsers(randomPage(), LIST_LIMIT);
}
