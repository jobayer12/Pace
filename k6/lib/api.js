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

/**
 * The endpoint returns a bare JSON array of rows -- the `{ data, meta }`
 * envelope went away with the `SELECT count(*)` that used to fill `meta.total`.
 */
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

  // Shape is asserted only where the body survives -- smoke-test.js keeps
  // bodies, the load test discards them. Parsing a page of rows on every
  // request at 2000 req/s would be generator overhead competing with the test,
  // and the smoke run already catches a regression back to the envelope before
  // the load run starts.
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
  // A 409 would mean the address generator collided, which is a defect in the
  // generator rather than a property of the system under test -- so it is
  // deliberately not accepted here.
  check(res, { 'POST /users -> 201': (r) => r.status === 201 });
  return res;
}

/**
 * Picks a read endpoint according to READ_MIX, using a random id each time.
 *
 * The roll is drawn against the sum of the three weights rather than a hard
 * 100, so the mix stays proportional whatever the operator passes. Drawing
 * against 100 would make `list` the silent remainder: `-e MIX_LIST=30` on top
 * of the 60/40 defaults would produce no list traffic at all, because every
 * roll below 100 lands in one of the first two branches.
 */
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
