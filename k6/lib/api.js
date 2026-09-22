import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import {
  API,
  LIST_LIMIT,
  READ_MIX,
  READ_MIX_TOTAL,
  emailForId,
  randomId,
  randomPage,
} from './config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

http.setResponseCallback(http.expectedStatuses(200, 201, 404));
export const idHitRate = new Rate('read_id_hit_rate');
export const emailHitRate = new Rate('read_email_hit_rate');

const tags = (name, kind) => ({ tags: { name, kind } });

export function getUserById(id) {
  const res = http.get(`${API}/users/${id}`, tags('GET /users/:id', 'read'));
  check(res, { 'GET /users/:id -> 200 or 404': (r) => r.status === 200 || r.status === 404 });
  idHitRate.add(res.status === 200);
  return res;
}

export function getUserByEmail(email) {
  const res = http.get(`${API}/users/email/${email}`, tags('GET /users/email/:email', 'read'));
  check(res, {
    'GET /users/email/:email -> 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
  emailHitRate.add(res.status === 200);
  return res;
}

const isJsonArray = (body) => {
  try {
    return Array.isArray(JSON.parse(body));
  } catch (e) {
    return false;
  }
};

export function listUsers(page, limit) {
  const res = http.get(`${API}/users?page=${page}&limit=${limit}`, tags('GET /users', 'read'));

  const assertions = { 'GET /users -> 200': (r) => r.status === 200 };

  if (res.status === 200 && res.body) {
    assertions['GET /users -> array body'] = (r) => isJsonArray(r.body);
  }

  check(res, assertions);
  return res;
}

export function createUser(email, firstName, lastName) {
  const body = JSON.stringify({ email, firstName, lastName });
  const res = http.post(`${API}/users`, body, {
    headers: JSON_HEADERS,
    ...tags('POST /users', 'write'),
  });
  check(res, { 'POST /users -> 201': (r) => r.status === 201 });
  return res;
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
