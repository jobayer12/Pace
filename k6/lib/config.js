export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API = `${BASE_URL}/api`;

// rate: hold a fixed RATE req/s and report how the API copes.
// max:  VUS virtual users send back-to-back requests with no pause, so the
//       achieved req/s is the most the API can serve at that concurrency.
export const MODE = (__ENV.MODE || 'rate').toLowerCase();

export const TOTAL_RATE = Number(__ENV.RATE || 2000);
export const VUS = Number(__ENV.VUS || 100);

export const READ_PERCENT = Number(__ENV.READ_PERCENT || 70);
export const READ_RATE = Math.round(TOTAL_RATE * (READ_PERCENT / 100));
export const WRITE_RATE = TOTAL_RATE - READ_RATE;
export const READ_VUS = Math.max(1, Math.round(VUS * (READ_PERCENT / 100)));
export const WRITE_VUS = Math.max(0, VUS - READ_VUS);

export const DURATION = __ENV.DURATION || '1m';

export const WARMUP = __ENV.WARMUP || '10s';
export const WARMUP_RATE = Number(__ENV.WARMUP_RATE || Math.max(50, Math.round(TOTAL_RATE * 0.1)));
export const WARMUP_ENABLED = WARMUP !== '0s' && WARMUP !== '0';

export const MIN_ID = Number(__ENV.MIN_ID || 1);
export const MAX_ID = Number(__ENV.MAX_ID || 50000000);

export const EMAIL_TEMPLATE = __ENV.EMAIL_TEMPLATE || 'user{id}@loadtest.local';
export const NODE_ID = __ENV.NODE_ID || '';

export const READ_MIX = {
  byId: Number(__ENV.MIX_BY_ID || 50),
  byEmail: Number(__ENV.MIX_BY_EMAIL || 30),
  list: Number(__ENV.MIX_LIST || 20),
};
export const READ_MIX_TOTAL = READ_MIX.byId + READ_MIX.byEmail + READ_MIX.list;

export const LIST_MAX_PAGE = Number(__ENV.LIST_MAX_PAGE || 50);
export const LIST_LIMIT = Number(__ENV.LIST_LIMIT || 20);

export const SUMMARY_FILE = __ENV.SUMMARY_FILE || 'summary.json';

export const randomPage = () => 1 + Math.floor(Math.random() * LIST_MAX_PAGE);

export const randomId = () => MIN_ID + Math.floor(Math.random() * (MAX_ID - MIN_ID + 1));

export const emailForId = (id) => EMAIL_TEMPLATE.replace('{id}', id);

export const vusFor = (rate) => ({
  preAllocatedVUs: Math.max(50, Math.ceil(rate * 0.25)),
  maxVUs: Math.max(100, Math.ceil(rate * 1.0)),
});

// "1m30s" -> 90. Used to turn request counts into req/s over the measured
// window only, so setup and warm-up time do not dilute the figure.
export function durationSeconds(value) {
  const units = { ms: 0.001, s: 1, m: 60, h: 3600 };
  let total = 0;
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let match;
  while ((match = re.exec(String(value))) !== null) {
    total += Number(match[1]) * units[match[2]];
  }
  return total || Number(value) || 0;
}
