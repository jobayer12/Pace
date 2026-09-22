import http from 'k6/http';
import { API, LIST_LIMIT, MAX_ID, MIN_ID, emailForId, randomId } from './config.js';

/**
 * Samples the id range before the run starts and reports how often a random id
 * actually finds a row.
 *
 * This is the guard against a run that "passes" against the wrong database: if
 * MAX_ID is far beyond the real max(id), or the table is empty, every read is a
 * 404. Those are not counted as failures by design, so without this probe the
 * run would look perfectly healthy while measuring nothing but index misses.
 */
export function probeHitRate(samples = 20) {
  let idHits = 0;
  let emailHits = 0;

  const requests = [];
  for (let i = 0; i < samples; i += 1) {
    const id = randomId();
    requests.push({ method: 'GET', url: `${API}/users/${id}`, params: { responseType: 'none' } });
    requests.push({
      method: 'GET',
      url: `${API}/users/email/${emailForId(id)}`,
      params: { responseType: 'none' },
    });
  }

  const responses = http.batch(requests);
  for (let i = 0; i < responses.length; i += 2) {
    if (responses[i].status === 200) idHits += 1;
    if (responses[i + 1].status === 200) emailHits += 1;
  }

  const idRate = idHits / samples;
  const emailRate = emailHits / samples;

  console.log(
    `id range ${MIN_ID}..${MAX_ID} | sampled ${samples}: ` +
      `by-id hit ${(idRate * 100).toFixed(0)}%, by-email hit ${(emailRate * 100).toFixed(0)}%`,
  );

  if (idHits === 0) {
    console.warn(
      `WARNING: no random id in ${MIN_ID}..${MAX_ID} matched a row. Every by-id read will be a ` +
        `404. Check MAX_ID against "SELECT max(id) FROM users" and that BASE_URL points at the ` +
        `right database.`,
    );
  }
  if (emailHits === 0) {
    console.warn(
      `WARNING: no by-email read matched. EMAIL_TEMPLATE ("${emailForId('{id}')}") does not ` +
        `match your data; set -e EMAIL_TEMPLATE='<your pattern with {id}>'.`,
    );
  }

  return { idRate, emailRate };
}

/**
 * Confirms GET /api/users still answers with a bare array before the run
 * starts.
 *
 * The endpoint used to wrap its rows in `{ data, meta }`, where `meta.total`
 * came from a `SELECT count(*)` -- a full table scan that made the endpoint far
 * too expensive to include in the mix. Now that it returns the page alone it is
 * in the default mix, so a rollback of that change has to be loud: it would
 * otherwise show up only as an unexplained collapse in list latency, with every
 * status still a healthy 200.
 */
export function probeListShape() {
  const res = http.get(`${API}/users?page=1&limit=${LIST_LIMIT}`);

  if (res.status !== 200) {
    console.warn(`WARNING: GET /users?page=1 returned ${res.status}; list reads will all fail.`);
    return { ok: false, rows: 0 };
  }

  let body;
  try {
    body = JSON.parse(res.body);
  } catch (e) {
    console.warn('WARNING: GET /users returned a body that is not JSON.');
    return { ok: false, rows: 0 };
  }

  if (!Array.isArray(body)) {
    const keys = Object.keys(body || {}).join(', ');
    console.warn(
      `WARNING: GET /users returned an object ({ ${keys} }), not an array. The tests expect the ` +
        `page of rows on its own. If the pagination envelope is back, so is the SELECT count(*) ` +
        `behind it -- set -e MIX_LIST=0 before reading anything into these numbers.`,
    );
    return { ok: false, rows: 0 };
  }

  console.log(`list shape ok | GET /users?limit=${LIST_LIMIT} returned ${body.length} rows`);

  if (body.length === 0) {
    console.warn('WARNING: page 1 of GET /users is empty -- the table looks empty.');
  }

  return { ok: true, rows: body.length };
}
