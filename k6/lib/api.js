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
export const apiFound = new Counter('api_found');
export const apiNotFound = new Counter('api_not_found');
export const apiErrors = new Counter('api_errors');
// Good status (200/201/404) but slower than SLOW_MS: counted as failed.
export const apiSlow = new Counter('api_slow');
export const apiSuccess = new Rate('api_success');

const endpointDuration = {};
const endpointRequests = {};
const endpointFailed = {};
for (const key of Object.keys(ENDPOINTS)) {
  endpointDuration[key] = new Trend(`api_duration_${key}`, true);
  endpointRequests[key] = new Counter(`api_requests_${key}`);
  endpointFailed[key] = new Counter(`api_errors_${key}`);
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
  apiSuccess.add(goodStatus && !slow);

  if (!goodStatus) {
    apiErrors.add(1);
    endpointFailed[key].add(1);
    if (errorLog.error < 1) {
      errorLog.error += 1;
      console.warn(`${ENDPOINTS[key]} -> ${res.status || res.error} after ${duration.toFixed(0)}ms`);
    }
  } else if (slow) {
    apiSlow.add(1);
    endpointFailed[key].add(1);
    if (errorLog.slow < 1) {
      errorLog.slow += 1;
      console.warn(`${ENDPOINTS[key]} -> ${res.status} but took ${duration.toFixed(0)}ms (> ${SLOW_MS}ms)`);
    }
  } else if (res.status === 404) {
    apiNotFound.add(1);
  } else {
    apiFound.add(1);
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
