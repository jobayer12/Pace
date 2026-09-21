import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';
import { API, LIST_MAX_PAGE, READ_MIX, emailForId, randomId } from './config.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Reads draw random ids from a range, so a miss is expected rather than
 * exceptional. Without this, k6's default "2xx is success" rule would score
 * every 404 as a failed request and http_req_failed would report a fault rate
 * that is really just the miss rate.
 *
 * A 404 still costs a full index probe, which is exactly the work being
 * measured -- so misses belong in the latency numbers, just not in the error
 * numbers. The hit rate is tracked separately below.
 */
http.setResponseCallback(http.expectedStatuses(200, 201, 404));

/** What fraction of random reads actually found a row. */
export const idHitRate = new Rate('read_id_hit_rate');
export const emailHitRate = new Rate('read_email_hit_rate');

/**
 * Every request carries an explicit `name` tag. Without it k6 groups metrics by
 * URL, so every id and email would become its own row in the summary -- the
 * same unbounded-cardinality trap the backend avoids on its Prometheus `route`
 * label.
 */
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

export function listUsers(page, limit) {
  const res = http.get(`${API}/users?page=${page}&limit=${limit}`, tags('GET /users', 'read'));
  check(res, { 'GET /users -> 200': (r) => r.status === 200 });
  return res;
}

export function createUser(email, firstName, lastName) {
  const body = JSON.stringify({ email, firstName, lastName });
  const res = http.post(`${API}/users`, body, {
    headers: JSON_HEADERS,
    ...tags('POST /users', 'write'),
  });
  // A 409 would mean the address generator collided, which is a defect in the
  // generator rather than a property of the system under test -- so it is
  // deliberately not accepted here.
  check(res, { 'POST /users -> 201': (r) => r.status === 201 });
  return res;
}

/** Picks a read endpoint according to READ_MIX, using a random id each time. */
export function performRead() {
  const roll = Math.random() * 100;

  if (roll < READ_MIX.byId) {
    return getUserById(randomId());
  }

  if (roll < READ_MIX.byId + READ_MIX.byEmail) {
    return getUserByEmail(emailForId(randomId()));
  }

  const limit = 20;
  return listUsers(1 + Math.floor(Math.random() * LIST_MAX_PAGE), limit);
}
