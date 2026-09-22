export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
export const API = `${BASE_URL}/api`;

export const TOTAL_RATE = Number(__ENV.RATE || 2000);

export const READ_PERCENT = Number(__ENV.READ_PERCENT || 70);

export const READ_RATE = Math.round(TOTAL_RATE * (READ_PERCENT / 100));
export const WRITE_RATE = TOTAL_RATE - READ_RATE;

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

export const randomPage = () => 1 + Math.floor(Math.random() * LIST_MAX_PAGE);

export const randomId = () => MIN_ID + Math.floor(Math.random() * (MAX_ID - MIN_ID + 1));

export const emailForId = (id) => EMAIL_TEMPLATE.replace('{id}', id);
export const vusFor = (rate) => ({
  preAllocatedVUs: Math.max(50, Math.ceil(rate * 0.25)),
  maxVUs: Math.max(100, Math.ceil(rate * 1.0)),
});
