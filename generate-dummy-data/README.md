# generate-dummy-data

Bulk-loads dummy users into the `users` table. Written in Go, uses PostgreSQL's
`COPY` protocol — 50M rows takes a few minutes, not hours.

| Package | Used for |
| ------- | -------- |
| [`jackc/pgx/v5`](https://github.com/jackc/pgx) | PostgreSQL driver and `COPY` |
| [`brianvoe/gofakeit/v6`](https://github.com/brianvoe/gofakeit) | Random first and last names |
| [`joho/godotenv`](https://github.com/joho/godotenv) | Reading `DB_*` from `.env` |

## Build

```bash
cd generate-dummy-data
go build -o bin/generate-dummy-data .
```

## Configure

```bash
cp .env.example .env     # then fill in the values
```

```ini
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=
DB_NAME=load_testing
```

This step is optional — with no local `.env`, the loader falls back to
`../backend/.env`, so a configured backend needs nothing further.

## Run

```bash
./bin/generate-dummy-data                      # 50,000,000 rows
./bin/generate-dummy-data -total 1000000       # 1M rows
./bin/generate-dummy-data -dsn postgres://user:pass@host:5432/dbname
```

```
target      : postgres://postgres:***@localhost:5432/load_testing
rows        : 50,000,000
id range    : 1 .. 50,000,000
email       : user1@loadtest.local .. user50000000@loadtest.local
workers     : 8, batch 50,000

  12,350,000 / 50,000,000  ( 24.7%)  236,555 rows/sec  eta 2m39s
```

Run the migrations first — the table has to exist:

```bash
cd ../backend && npm run migrate:latest
```

## Flags

| Flag | Default | |
| ---- | ------- | --- |
| `-total` | `50000000` | Rows to insert |
| `-start` | `0` | First id; `0` means `max(id)+1` |
| `-workers` | `8` | Parallel COPY workers |
| `-batch` | `50000` | Rows per COPY call |
| `-dsn` | — | Connection string; overrides everything below |
| `-env-file` | `.env,../backend/.env` | Env files to read `DB_*` from; earlier wins, missing ones skipped |
| `-prefix` | `user` | Email local-part prefix |
| `-domain` | `loadtest.local` | Email domain |
| `-days-back` | `365` | Spread `created_at` over this many days |
| `-truncate` | `false` | **Destructive** — empties the table first |
| `-reset-sequence` | `true` | Move the id sequence past the inserted rows |

Connection settings resolve in this order, first match wins:

1. `-dsn`
2. `DATABASE_URL`
3. `DB_*` exported in the environment
4. `DB_*` in `./.env`
5. `DB_*` in `../backend/.env`

Files are read with `godotenv`, which never overwrites a variable that is
already set — that is what gives 3 → 4 → 5 their order. Each file is loaded
separately, because a single `godotenv.Load` call stops at its first error and a
missing local `.env` would otherwise prevent the backend fallback from being
read at all. A missing file is not an error.

The connection string is assembled through `net/url`, so a password containing
`@`, `:` or `/` is escaped rather than quietly producing a malformed DSN.

## How emails are kept unique

Each row's email is derived from its primary key:

```
id    = start + n
email = user<id>@loadtest.local
```

`start` defaults to `max(id) + 1`, so a run can never overlap rows that already
exist — and stopping and re-running simply continues from where it left off. The
id range is then split into contiguous, non-overlapping batches, one per worker,
so two goroutines cannot produce the same address either.

Uniqueness is **structural, not checked**: there is no random generation, no
retry loop and no `ON CONFLICT` clause, because a duplicate is not representable.
That is what makes `COPY` safe here, and `COPY` is what makes 50M rows fast.

Names are the opposite case — they are not a lookup key, so they come from
gofakeit and only need to look plausible and vary in length. Each worker builds
its own `gofakeit.NewUnlocked` faker: the package-level helpers and `New()` both
guard a shared random source with a mutex, which every worker would otherwise
contend on twice per row. Dropping the lock is safe because a worker's faker
never leaves its goroutine.

Because ids are written explicitly, the table's sequence is left pointing inside
the range that was just filled by hand — the next `INSERT` from the API would
collide. `-reset-sequence` (on by default) moves it past the end afterwards.

## Interrupting a run

`Ctrl-C` cancels cleanly. In-flight `COPY` calls are rolled back by the server,
so the table keeps only fully completed batches. Re-run the same command to
continue — the new `start` is recomputed from `max(id)`.

## Why the email matches the id

The k6 suite reads by random id *and* by email. Tying the two together lets it
reach any row by either key with the default template:

```bash
k6 run -e MAX_ID=50000000 -e EMAIL_TEMPLATE='user{id}@loadtest.local' load-test.js
```

Find the range to give k6 after loading:

```sql
SELECT min(id), max(id) FROM users;
```

## Loading faster

The unique index on `email` is maintained on every inserted row. For a one-off
bulk load into an empty table it is faster to drop it, load, and rebuild:

```sql
DROP INDEX users_email_unique;
-- run the loader
CREATE UNIQUE INDEX CONCURRENTLY users_email_unique ON users (email);
```

Only do this when nothing else is writing — while the index is gone, nothing is
enforcing uniqueness. Rebuilding on 50M rows takes a few minutes.
