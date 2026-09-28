# load-testing

A NestJS + PostgreSQL API, a tool that fills its database with tens of millions
of rows, and a k6 suite that measures how many requests per second the API can
serve and how fast it responds.

## Projects

| Folder | What it is | Docs |
| ------ | ---------- | ---- |
| [`backend/`](backend) | NestJS 11 API over PostgreSQL (Knex), clustered across CPU cores, with Winston logs, Prometheus metrics and OpenTelemetry tracing | [backend/README.md](backend/README.md) |
| [`generate-dummy-data/`](generate-dummy-data) | Go bulk loader that inserts dummy users with `COPY` (50M rows in a few minutes) | [generate-dummy-data/README.md](generate-dummy-data/README.md) |
| [`k6/`](k6) | k6 load and smoke tests, plus `run-steps.sh` for stepped runs | [k6/README.md](k6/README.md) |

## End-to-end

1. **Start the backend.** Install, configure `.env`, create the database and
   run the migrations. See [backend setup](backend/README.md#setup).

   ```bash
   cd backend
   npm install
   cp .env.example .env   # fill in DB_PASSWORD
   createdb load_testing
   npm run migrate:latest
   npm run start:dev
   ```

2. **Load test data.** The loader reads `DB_*` from `../backend/.env` if it has
   no `.env` of its own. See [generate-dummy-data](generate-dummy-data/README.md#run).

   ```bash
   cd generate-dummy-data
   go build -o bin/generate-dummy-data .
   ./bin/generate-dummy-data -total 1000000
   ```

3. **Run the load test.** Match `MAX_ID` to the number of rows you loaded. See
   [k6 quick start](k6/README.md#quick-start).

   ```bash
   cd k6
   k6 run -e BASE_URL=http://localhost:3000 smoke-test.js
   k6 run -e BASE_URL=http://localhost:3000 -e MAX_ID=1000000 -e RATE=2000 load-test.js
   ```

## Stepped and multi-VM runs

[`k6/run-steps.sh`](k6/run-steps.sh) runs `MODE=max` once per value in `STEPS`
(for example `STEPS="100 200 400"`), cooling down between steps, and prints a
comparison table. Results land in `k6/results/<label>/`.

```bash
cd k6
STEPS="100 200 400" DURATION=2m BASE_URL=http://localhost:3000 ./run-steps.sh baseline
```

To generate more load than one machine can, run k6 on several VMs with a
distinct `NODE_ID` each and add up their `requests/sec`. See
[running on several VMs](k6/README.md#running-on-several-vms).

## Requirements

- Node.js >= 20 and PostgreSQL (backend)
- Go (dummy-data loader)
- k6, and `jq` for `run-steps.sh`
