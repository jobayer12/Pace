# Pace

A NestJS + PostgreSQL API and a k6 load-test suite for driving it.

| Folder | What |
| ------ | ---- |
| [`backend/`](backend) | The API — NestJS 11, Knex, Prometheus metrics, Winston logs, Swagger |
| [`k6/`](k6) | The load tests — 70% read / 30% write at a fixed request rate |

---

## Requirements

- **Node.js 20+** (NestJS 11 does not run on 18 or below)
- **PostgreSQL 14+**
- **[k6](https://k6.io/docs/get-started/installation/)** on each load-generator machine

---

## Backend setup

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Create the database

```bash
createdb load_testing
# or:  psql -c 'CREATE DATABASE load_testing;'
```

### 3. Configure

```bash
cp .env.example .env
```

```ini
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=load_testing

DB_POOL_MIN=2
DB_POOL_MAX=10

LOG_LEVEL=debug
SERVICE_NAME=backend

SWAGGER_ENABLED=true
```

| Variable | Default | Notes |
| -------- | ------- | ----- |
| `PORT` | `3000` | HTTP port |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `2` / `10` | Knex connection pool |
| `LOG_LEVEL` | `debug` (`info` in production) | Winston level |
| `SERVICE_NAME` | `backend` | `service` field in JSON logs |
| `SWAGGER_ENABLED` | `true` | `false` disables `/docs` |

In production set `NODE_ENV=production` (switches logs to single-line JSON),
`LOG_LEVEL=info`, and `SWAGGER_ENABLED=false`.

### 4. Run migrations

```bash
npm run migrate:latest
```

Creates the `users` table: `id` (bigserial PK), `email` (unique, indexed),
`first_name` / `last_name` (varchar 255), `created_at` (timestamptz, UTC).

| Command | |
| ------- | --- |
| `npm run migrate:latest` | Apply |
| `npm run migrate:rollback` | Undo last batch |
| `npm run migrate:status` | Show state |

### 5. Start

```bash
npm run start:dev      # watch mode
```

```bash
npm run build          # production
npm run start:prod
```

### 6. Verify

| URL | |
| --- | --- |
| `http://localhost:3000/api` | API |
| `http://localhost:3000/docs` | Swagger UI |
| `http://localhost:3000/docs/json` | OpenAPI spec |
| `http://localhost:3000/metrics` | Prometheus metrics |

```bash
curl -s localhost:3000/api/users?limit=1
```

### API

| Method | Path | |
| ------ | ---- | --- |
| `GET` | `/api/users?page=1&limit=20` | Paginated list, `limit` capped at 100 |
| `GET` | `/api/users/:id` | By id |
| `GET` | `/api/users/email/:email` | By email, case-insensitive |
| `POST` | `/api/users` | Create |

Full reference: [backend/README.md](backend/README.md).

---

## k6 setup

Install k6 on each machine that will generate load. Nothing else is needed
there — no Node, no database client, just the `k6/` folder.

```bash
# macOS
brew install k6

# Debian / Ubuntu
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install -y k6
```

### 1. Find your id range

The tests read **random ids** from your existing data. Nothing is seeded.

```sql
SELECT min(id), max(id) FROM users;
```

Pass those as `MIN_ID` / `MAX_ID`. Also set `EMAIL_TEMPLATE` to match your data's
address pattern, using `{id}` as the placeholder — otherwise every by-email read
is a miss.

### 2. Smoke test first

```bash
cd k6

k6 run \
  -e BASE_URL=http://<api-host>:3000 \
  -e MIN_ID=1 -e MAX_ID=50000000 \
  -e EMAIL_TEMPLATE='user{id}@example.com' \
  smoke-test.js
```

10 req/s for 10 seconds. It fails if reads never find a row, which catches a
wrong `BASE_URL`, an unmigrated database or a bad `MAX_ID` in seconds.

### 3. Run the load test

```bash
k6 run \
  -e BASE_URL=http://<api-host>:3000 \
  -e NODE_ID=vm1 \
  -e RATE=2000 \
  -e DURATION=5m \
  -e MIN_ID=1 -e MAX_ID=50000000 \
  -e EMAIL_TEMPLATE='user{id}@example.com' \
  --summary-trend-stats='avg,min,med,p(95),p(99),max' \
  --summary-export=results/vm1.json \
  load-test.js
```

### 4. Several machines at once

`RATE` is **per k6 instance**, so six machines at `RATE=2000` put 12k req/s on
the server. Run the same command on each, changing only `NODE_ID`:

```bash
# VM 1        VM 2              VM 6
-e NODE_ID=vm1   -e NODE_ID=vm2   ...   -e NODE_ID=vm6
```

`NODE_ID` **must be unique per machine.** Writes build their email address from
it, so two machines sharing one can generate the same address, collide on the
unique index, and return a 409 that looks like a server fault.

Start the runs at roughly the same time; the 10s warm-up phase absorbs small
differences. Each run reports only its own share, so read the server's
`/metrics` for the combined picture.

### Configuration

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `BASE_URL` | `http://localhost:3000` | Target host |
| `RATE` | `2000` | Requests per second from this instance |
| `READ_PERCENT` | `70` | Read share; the rest are writes |
| `DURATION` | `1m` | Length of the measured phase |
| `NODE_ID` | random | Unique per machine |
| `MIN_ID` / `MAX_ID` | `1` / `50000000` | Id range reads are drawn from |
| `EMAIL_TEMPLATE` | `user{id}@loadtest.local` | Address pattern for by-email reads |
| `WARMUP` | `10s` | Warm-up phase; `0s` disables |
| `MIX_BY_ID` / `MIX_BY_EMAIL` / `MIX_LIST` | `60` / `40` / `0` | Split of the read budget |

Design notes, threshold meanings and how to read the output:
[k6/README.md](k6/README.md).

> **`MIX_LIST` defaults to `0`.** `GET /api/users` runs `SELECT count(*)` on
> every call — a full table scan, measured at 342ms on 10M rows and roughly 1.7s
> on 50M. Enable it with `-e MIX_LIST=30` once that endpoint is changed to use an
> estimated count or keyset pagination.

---

## Cleaning up after a run

Load-test writes are identifiable by their address:

```sql
DELETE FROM users WHERE email LIKE 'load-%@loadtest.local'
                     OR email LIKE 'warmup-%@loadtest.local'
                     OR email LIKE 'smoke-%@loadtest.local';
```
