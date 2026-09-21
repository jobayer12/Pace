import http from 'k6/http';
import { API, MAX_ID, MIN_ID, emailForId, randomId } from './config.js';

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
