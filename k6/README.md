# k6 load tests

Measures the backend in [`../backend`](../backend): **response time** and
**requests per second**. There are no pass/fail thresholds. The run always
finishes and prints a report.

For server provisioning and multi-VM orchestration, see the
[root readme](../readme.md).

## Requirements

- [k6](https://k6.io/docs/get-started/installation/) (tested on v2.3.0)
- A running backend with data already in the `users` table

## Quick start

```bash
# Rehearsal: 10 req/s for 10s
k6 run -e BASE_URL=http://localhost:3000 smoke-test.js

# Fixed rate: can the API handle 2000 req/s, and how fast does it respond?
k6 run -e BASE_URL=http://localhost:3000 -e RATE=2000 load-test.js

# Max throughput: how many req/s can the API serve with 200 concurrent clients?
k6 run -e BASE_URL=http://localhost:3000 -e MODE=max -e VUS=200 load-test.js
```

## Two modes

| `MODE` | What it does | Question it answers |
| ------ | ------------ | ------------------- |
| `rate` (default) | Sends exactly `RATE` req/s (`constant-arrival-rate`) | "At X req/s, what is the response time?" |
| `max` | `VUS` users each send the next request as soon as the last one returns (`constant-vus`) | "How many req/s can the API serve at all?" |

To find capacity, run `MODE=max` several times with more `VUS` each time
(50, 100, 200, 400 …). The point where `requests/sec` stops rising while
response time keeps climbing is the API's maximum throughput.

## 404 is not an error

Reads use random ids and emails. When a row doesn't exist, the API returns
`404`. That is a correct answer, and it still costs a full index lookup, so:

- `200`, `201` and `404` all count as successful and are included in the
  response times.
- Only other statuses (`5xx`, `409`, `400`, timeouts and connection errors)
  count as `errors`. The first error on each VU is logged so you can see what
  happened.
- The report shows how many requests were `found` and how many were
  `not found`, for information only.

## The report

```
================ API LOAD TEST RESULT ================
mode              rate  (2000 req/s target (1400 read / 600 write))
measured window   60s

THROUGHPUT
  requests/sec          1998.7
  successful req/sec    1998.7   (200/201/404)

REQUESTS
  total                 119922
  found (200/201)       84010  70.05%
  not found (404)       35912  29.95%   <- no row in DB, not an error
  errors                0  0.00%

RESPONSE TIME (all endpoints)
  avg             3.10ms
  ...
  p(95)           7.80ms
  p(99)          14.20ms

PER ENDPOINT
  endpoint                       reqs     req/s        avg        p95        p99  errors
  GET /users/:id                 ...
```

- **requests/sec** is the total number of measured requests divided by
  `DURATION`. Warm-up and setup are excluded.
- In `rate` mode, if the API can't keep up, k6 reports `dropped_iterations` and
  the report adds a note. In that case, the achieved `requests/sec` is lower
  than the target, and the achieved figure is the real one.
- The same numbers are written to `summary.json` (set a different path with
  `SUMMARY_FILE`).

## Configuration

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `BASE_URL` | `http://localhost:3000` | Target host |
| `MODE` | `rate` | `rate` or `max` |
| `RATE` | `2000` | `rate` mode: requests per second from this k6 instance |
| `VUS` | `100` | `max` mode: number of concurrent users |
| `READ_PERCENT` | `70` | Read share of rate or VUs; the rest are writes |
| `DURATION` | `1m` | Length of the measured phase |
| `WARMUP` | `10s` | Warm-up before measuring (not counted); `0s` disables it |
| `WARMUP_RATE` | `RATE / 10` | Warm-up request rate |
| `MIN_ID` / `MAX_ID` | `1` / `50000000` | Id range that reads are drawn from |
| `EMAIL_TEMPLATE` | `user{id}@loadtest.local` | Address pattern for by-email reads |
| `MIX_BY_ID` / `MIX_BY_EMAIL` / `MIX_LIST` | `50` / `30` / `20` | Weights for splitting the reads |
| `LIST_MAX_PAGE` / `LIST_LIMIT` | `50` / `20` | Paging depth and page size for list reads |
| `NODE_ID` | random | Unique per VM (keeps write emails unique) |
| `SUMMARY_FILE` | `summary.json` | Where the JSON report is written |

## Running on several VMs

Each VM generates its own load. For example, six VMs at `RATE=2000` send 12k
req/s to the server. To get the server's total, add up `requests/sec` from each
VM's `summary.json`. Give each VM its own `-e NODE_ID=vm1` so that write emails
don't collide (a collision would return `409` and count as an error).

## Files

| File | |
| ---- | --- |
| [`load-test.js`](load-test.js) | Main test: scenarios for both modes, setup, report |
| [`smoke-test.js`](smoke-test.js) | 10 req/s rehearsal over the same code paths |
| [`lib/config.js`](lib/config.js) | All settings |
| [`lib/api.js`](lib/api.js) | Endpoint wrappers; counts 200/404/errors and response time |
| [`lib/summary.js`](lib/summary.js) | Builds the console report and `summary.json` |
| [`lib/probe.js`](lib/probe.js) | Before the run, logs roughly how many reads will find a row |

## After a run

Writes add rows. To clean up:

```sql
DELETE FROM users WHERE email LIKE 'load-%@loadtest.local'
                     OR email LIKE 'warmup-%@loadtest.local'
                     OR email LIKE 'smoke-%@loadtest.local';
```
