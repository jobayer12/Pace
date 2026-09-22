# k6 load tests

Drives the backend in [`../backend`](../backend) at a fixed request rate with a
70% read / 30% write mix, using **random ids against your existing data**.

For server provisioning and multi-VM orchestration see the
[root readme](../readme.md). This file covers how the tests themselves work.

## Requirements

- [k6](https://k6.io/docs/get-started/installation/) — developed against v2.2.0
- A running backend with data already in the `users` table

Nothing is seeded. The tests read whatever is already there.

## Quick start

```bash
# Find your real id range first:
#   SELECT min(id), max(id) FROM users;

k6 run -e BASE_URL=http://localhost:3000 -e MAX_ID=50000000 smoke-test.js
k6 run -e BASE_URL=http://localhost:3000 -e MAX_ID=50000000 -e NODE_ID=vm1 load-test.js
```

Both exit non-zero if a threshold is crossed, so they drop into CI as-is.

## Configuration

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `BASE_URL` | `http://localhost:3000` | Target host |
| `RATE` | `2000` | Requests per second **from this one k6 instance** |
| `READ_PERCENT` | `70` | Read share; the rest are writes |
| `DURATION` | `1m` | Length of the measured phase |
| `NODE_ID` | random | **Unique per VM.** See below |
| `MIN_ID` / `MAX_ID` | `1` / `50000000` | Id range reads are drawn from |
| `EMAIL_TEMPLATE` | `user{id}@loadtest.local` | Address pattern for by-email reads |
| `WARMUP` | `10s` | Warm-up phase; `0s` disables |
| `WARMUP_RATE` | `RATE / 10` | Warm-up request rate |
| `MIX_BY_ID` / `MIX_BY_EMAIL` / `MIX_LIST` | `50` / `30` / `20` | Split of the read budget |
| `LIST_MAX_PAGE` | `50` | Deepest page the list read requests |
| `LIST_LIMIT` | `20` | Page size the list read asks for |

## How the 70/30 split is enforced

Reads and writes are two separate `constant-arrival-rate` scenarios — 1400/s and
600/s at the default rate — rather than one scenario rolling a die per
iteration. An arrival-rate executor holds a **fixed request rate regardless of
response time**, so the split is exact rather than true-on-average, and each
side gets its own latency thresholds.

## Random ids, and why a 404 is not a failure

Reads pick a uniformly random id in `MIN_ID..MAX_ID` on every request. Against a
table with gaps — or a `MAX_ID` set above the real maximum — some of those ids
do not exist.

A miss is a legitimate outcome, so the suite calls:

```js
http.setResponseCallback(http.expectedStatuses(200, 201, 404));
```

Without it, k6's default "2xx means success" rule would score every 404 as a
failed request, and `http_req_failed` would report a fault rate that is really
just the miss rate. A 404 still costs a full index probe — which is the work
being measured — so misses belong in the latency numbers, just not the error
numbers.

The hit rate is tracked separately as `read_id_hit_rate` and
`read_email_hit_rate`, and `setup()` samples the range before the run starts:

```
id range 1..50000000 | sampled 20: by-id hit 100%, by-email hit 100%
```

If that reads 0%, the run would otherwise look perfectly healthy while measuring
nothing but index misses — so `setup()` warns, and `smoke-test.js` fails outright
on a zero hit rate.

`EMAIL_TEMPLATE` must match your own data's address pattern (`{id}` is
substituted). Leave it wrong and every by-email read is a miss.

## Running on several VMs

Each VM generates `RATE` req/s; six VMs at 2000 is 12k req/s at the server.

**`NODE_ID` must be unique per VM.** Writes build their address from
`NODE_ID` + run id + iteration number. Two VMs sharing a `NODE_ID` could
generate the same address, collide on the unique index, and return a 409 that
looks like a server fault rather than a generator artefact. The check asserts
`201` and deliberately does not tolerate `409` for exactly this reason.

If `NODE_ID` is unset, `setup()` assigns a random token and warns.

Orchestration and result aggregation are in the [root readme](../readme.md).

## The list endpoint, and why it is now in the mix

`GET /api/users` returns the page of rows on its own:

```json
[{ "id": "1", "email": "...", "firstName": "...", "lastName": "...", "createdAt": "..." }]
```

It used to wrap them in a `{ data, meta }` envelope whose `meta.total` came from
`SELECT count(*)` — a full table scan, measured at 342ms on 10M rows and roughly
1.7s on 50M. Including it measured that one scan rather than the API, and
because the scan held a pooled connection for its whole duration it starved
every other endpoint too, so `MIX_LIST` defaulted to `0`.

The count is gone, so the endpoint is an ordinary indexed `LIMIT/OFFSET` read
and `MIX_LIST` defaults to `20`. Measured locally against 50M rows it lands at
p95 4.3ms, alongside the point lookups rather than three orders of magnitude
behind them. Set `-e MIX_LIST=0` to leave it out.

**The mix is weights, not percentages.** `performRead()` draws against the sum
of the three, so `-e MIX_LIST=30` on its own shifts traffic onto the list
endpoint instead of being silently swallowed. (Drawing against a hard 100 made
`list` the leftover: with `60/40` already accounting for every roll, a raised
`MIX_LIST` produced no list traffic at all.) Summing them to 100 just keeps them
readable as percentages.

**It has its own latency threshold**, `http_req_duration{name:GET /users}` at
p95 300ms / p99 600ms, added only when `MIX_LIST > 0`. The list read returns
`LIST_LIMIT` rows after an `OFFSET` skip, so it is legitimately slower than a
point lookup; folded into `{kind:read}` alone it would pull the shared read
percentiles around purely with `MIX_LIST`, making two runs at different mixes
incomparable.

**`LIST_MAX_PAGE` caps paging depth.** Dropping the count left `OFFSET` as the
endpoint's remaining cost, and it is O(offset) in PostgreSQL — 924ms at offset
9,000,000. No real client pages that far, so measuring it would be an artefact.

**The array shape is asserted, not assumed.** `setup()` fetches page 1 and
checks it, and `smoke-test.js` checks every list response. A rollback to the
envelope would otherwise be invisible: every status stays a healthy 200, and the
`count(*)` behind it would show up only as an unexplained collapse in list
latency.

## Other deliberate choices

**It warms up first.** The first second against a freshly started backend pays
for a cold JIT and a pool still growing from `DB_POOL_MIN`. That spike is large
enough that k6 cannot find a free VU in time and drops iterations — so the run
silently misses its target rate for reasons unrelated to steady-state capacity.
Warm-up traffic is tagged `kind:warmup` and excluded from the read/write
thresholds. `WARMUP=0s` measures cold start on purpose.

**Every request is tagged with a `name`.** Otherwise k6 groups metrics by URL
and every id and email becomes its own summary row — the same unbounded
cardinality trap the backend avoids on its Prometheus `route` label.

**Response bodies are discarded** — in `load-test.js`. Only status codes are
asserted there, so parsing a page of rows at 2000 req/s would be load-generator
overhead competing with the test. `smoke-test.js` keeps them: at 10 req/s the
cost is irrelevant, and it is what lets the rehearsal check the list endpoint's
shape before the real run.

## Reading the result

`dropped_iterations` is the first number to look at, and its threshold is
`count<1`. An arrival-rate executor drops an iteration whenever no VU is free to
start it on time, which means **this generator did not actually apply the
requested rate** — the latency figures then describe a lighter load than you
asked for. A latency result reported alongside dropped iterations is not valid.

If it is non-zero:

1. Check `http_req_duration`. If latency climbed, the server is saturated and
   that is the real answer.
2. If latency is healthy, the generator ran out of VUs — raise the multipliers
   in `vusFor()` in [`lib/config.js`](lib/config.js).

Note that `p(99)` is absent from `--summary-export` unless you ask for it:

```bash
--summary-trend-stats='avg,min,med,p(95),p(99),max'
```

Thresholds still evaluate p99 either way.

## Files

| File | |
| ---- | --- |
| [`load-test.js`](load-test.js) | The main test — scenarios, thresholds, setup |
| [`smoke-test.js`](smoke-test.js) | 10 req/s rehearsal over the same code paths |
| [`lib/config.js`](lib/config.js) | Every knob, and the VU sizing maths |
| [`lib/api.js`](lib/api.js) | Endpoint wrappers, tagging, 404 handling |
| [`lib/probe.js`](lib/probe.js) | Pre-run hit-rate sampling and list-shape check |

## After a run

Writes accumulate: 600 writes/s per VM for 5 minutes across 6 VMs adds ~1.08M
rows. Addresses are unique per run so nothing breaks, but to clean up:

```sql
DELETE FROM users WHERE email LIKE 'load-%@loadtest.local'
                     OR email LIKE 'warmup-%@loadtest.local'
                     OR email LIKE 'smoke-%@loadtest.local';
```
