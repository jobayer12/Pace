import http from 'k6/http';
import { API, MAX_ID, MIN_ID, emailForId, randomId } from './config.js';

// Informational only: shows roughly how many reads will find a row. A low hit
// rate is fine (404s are measured like any other response), it just means most
// reads are index misses rather than full row fetches.
export function probeHitRate(samples = 20) {
  const requests = [];
  for (let i = 0; i < samples; i += 1) {
    const id = randomId();
    requests.push({ method: 'GET', url: `${API}/users/${id}`, params: { responseType: 'none' } });
    requests.push({
      method: 'GET',
      url: `${API}/users/email/${encodeURIComponent(emailForId(id))}`,
      params: { responseType: 'none' },
    });
  }

  let idHits = 0;
  let emailHits = 0;
  const responses = http.batch(requests);
  for (let i = 0; i < responses.length; i += 2) {
    if (responses[i].status === 200) idHits += 1;
    if (responses[i + 1].status === 200) emailHits += 1;
  }

  console.log(
    `id range ${MIN_ID}..${MAX_ID} | sampled ${samples}: ` +
      `by-id found ${Math.round((idHits / samples) * 100)}%, ` +
      `by-email found ${Math.round((emailHits / samples) * 100)}% (the rest return 404)`,
  );
}
