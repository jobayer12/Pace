package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"math/rand/v2"
	"net"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/brianvoe/gofakeit/v6"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

type config struct {
	dsn      string
	envFile  string
	total    int64
	start    int64
	workers  int
	batch    int
	prefix   string
	domain   string
	daysBack int
	truncate bool
	resetSeq bool
}

func main() {
	cfg := parseFlags()

	if err := run(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "\nerror: %v\n", err)
		os.Exit(1)
	}
}

func parseFlags() config {
	var cfg config

	flag.StringVar(&cfg.dsn, "dsn", "", "PostgreSQL connection string (overrides DATABASE_URL and DB_* variables)")
	flag.StringVar(&cfg.envFile, "env-file", ".env,../backend/.env", "comma-separated env files to read DB_* from; earlier files win, missing ones are skipped")
	flag.Int64Var(&cfg.total, "total", 50_000_000, "number of rows to insert")
	flag.Int64Var(&cfg.start, "start", 0, "first id to use; 0 means max(id)+1")
	flag.IntVar(&cfg.workers, "workers", 8, "parallel COPY workers")
	flag.IntVar(&cfg.batch, "batch", 50_000, "rows per COPY call")
	flag.StringVar(&cfg.prefix, "prefix", "user", "email local-part prefix")
	flag.StringVar(&cfg.domain, "domain", "loadtest.local", "email domain")
	flag.IntVar(&cfg.daysBack, "days-back", 365, "spread created_at over this many days into the past")
	flag.BoolVar(&cfg.truncate, "truncate", false, "DESTRUCTIVE: empty the users table before loading")
	flag.BoolVar(&cfg.resetSeq, "reset-sequence", true, "after loading, move the id sequence past the inserted rows")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Bulk-loads dummy users into the `users` table.\n\nUsage:\n  generate-dummy-data [flags]\n\nFlags:\n")
		flag.PrintDefaults()
		fmt.Fprintf(os.Stderr, "\nExamples:\n"+
			"  generate-dummy-data                                  # 50M rows, config from ../backend/.env\n"+
			"  generate-dummy-data -total 1000000 -workers 12       # 1M rows, 12 workers\n"+
			"  generate-dummy-data -dsn postgres://user:pass@host:5432/db\n")
	}
	flag.Parse()

	return cfg
}

func run(cfg config) error {
	if cfg.total <= 0 {
		return errors.New("-total must be greater than 0")
	}
	if cfg.workers <= 0 {
		return errors.New("-workers must be greater than 0")
	}
	if cfg.batch <= 0 {
		return errors.New("-batch must be greater than 0")
	}

	dsn, err := resolveDSN(cfg)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("parse connection string: %w", err)
	}
	poolCfg.MaxConns = int32(cfg.workers)

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping %s: %w", redact(dsn), err)
	}

	if cfg.truncate {
		fmt.Println("truncating users ...")
		if _, err := pool.Exec(ctx, "TRUNCATE TABLE users RESTART IDENTITY"); err != nil {
			return fmt.Errorf("truncate: %w", err)
		}
	}

	start := cfg.start
	if start <= 0 {
		if err := pool.QueryRow(ctx,
			"SELECT COALESCE(MAX(id), 0) + 1 FROM users").Scan(&start); err != nil {
			return fmt.Errorf("determine starting id: %w", err)
		}
	}
	end := start + cfg.total

	fmt.Printf("target      : %s\n", redact(dsn))
	fmt.Printf("rows        : %s\n", comma(cfg.total))
	fmt.Printf("id range    : %s .. %s\n", comma(start), comma(end-1))
	fmt.Printf("email       : %s%d@%s .. %s%d@%s\n",
		cfg.prefix, start, cfg.domain, cfg.prefix, end-1, cfg.domain)
	fmt.Printf("workers     : %d, batch %s\n\n", cfg.workers, comma(int64(cfg.batch)))

	began := time.Now()
	var inserted atomic.Int64

	progressDone := make(chan struct{})
	go reportProgress(ctx, &inserted, cfg.total, began, progressDone)

	if err := load(ctx, pool, cfg, start, end, &inserted); err != nil {
		close(progressDone)
		fmt.Println()
		return err
	}
	close(progressDone)

	elapsed := time.Since(began)
	done := inserted.Load()
	fmt.Printf("\ninserted %s rows in %s (%s rows/sec)\n",
		comma(done), elapsed.Round(time.Second), comma(perSecond(done, elapsed)))

	if cfg.resetSeq {
		const resetSQL = `SELECT setval(
			pg_get_serial_sequence('users', 'id'),
			COALESCE((SELECT MAX(id) FROM users), 0) + 1,
			false)`
		if _, err := pool.Exec(ctx, resetSQL); err != nil {
			return fmt.Errorf("reset id sequence: %w", err)
		}
		fmt.Println("id sequence moved past the inserted rows")
	}

	return nil
}

type batch struct {
	from int64
	to   int64
}

func load(ctx context.Context, pool *pgxpool.Pool, cfg config, start, end int64, inserted *atomic.Int64) error {
	jobs := make(chan batch)

	var wg sync.WaitGroup
	errs := make(chan error, cfg.workers)

	for range cfg.workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := worker(ctx, pool, cfg, jobs, inserted); err != nil {
				errs <- err
			}
		}()
	}

dispatch:
	for from := start; from < end; from += int64(cfg.batch) {
		to := min(from+int64(cfg.batch), end)
		select {
		case jobs <- batch{from: from, to: to}:
		case <-ctx.Done():
			break dispatch
		}
	}

	close(jobs)
	wg.Wait()
	close(errs)

	if err := <-errs; err != nil {
		return err
	}
	if ctx.Err() != nil {
		return fmt.Errorf("interrupted: %w", ctx.Err())
	}
	return nil
}

var columns = []string{"id", "email", "first_name", "last_name", "created_at"}

func worker(ctx context.Context, pool *pgxpool.Pool, cfg config, jobs <-chan batch, inserted *atomic.Int64) error {
	maxAge := time.Duration(cfg.daysBack) * 24 * time.Hour

	faker := gofakeit.NewUnlocked(0)

	for b := range jobs {
		if ctx.Err() != nil {
			return nil
		}

		n := int(b.to - b.from)
		src := pgx.CopyFromSlice(n, func(i int) ([]any, error) {
			id := b.from + int64(i)
			return []any{
				id,
				fmt.Sprintf("%s%d@%s", cfg.prefix, id, cfg.domain),
				faker.FirstName(),
				faker.LastName(),
				time.Now().Add(-time.Duration(rand.Int64N(int64(maxAge)))).UTC(),
			}, nil
		})

		copied, err := pool.CopyFrom(ctx, pgx.Identifier{"users"}, columns, src)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("copy ids %d..%d: %w", b.from, b.to-1, err)
		}

		inserted.Add(copied)
	}

	return nil
}

func reportProgress(ctx context.Context, inserted *atomic.Int64, total int64, began time.Time, done <-chan struct{}) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			n := inserted.Load()
			elapsed := time.Since(began)
			rate := perSecond(n, elapsed)

			eta := "--"
			if rate > 0 && n < total {
				eta = (time.Duration((total-n)/rate) * time.Second).Round(time.Second).String()
			}

			fmt.Printf("\r  %s / %s  (%5.1f%%)  %s rows/sec  eta %-10s",
				comma(n), comma(total), float64(n)*100/float64(total), comma(rate), eta)

		case <-done:
			return
		case <-ctx.Done():
			return
		}
	}
}

func resolveDSN(cfg config) (string, error) {
	if cfg.dsn != "" {
		return cfg.dsn, nil
	}

	for _, path := range strings.Split(cfg.envFile, ",") {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		if err := godotenv.Load(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("load %s: %w", path, err)
		}
	}

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		return dsn, nil
	}

	get := func(key, fallback string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		return fallback
	}

	dsn := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(get("DB_USER", "postgres"), get("DB_PASSWORD", "")),
		Host:   net.JoinHostPort(get("DB_HOST", "localhost"), get("DB_PORT", "5432")),
		Path:   "/" + get("DB_NAME", "load_testing"),
	}

	return dsn.String(), nil
}

func redact(dsn string) string {
	at := strings.LastIndex(dsn, "@")
	slashes := strings.Index(dsn, "//")
	if at == -1 || slashes == -1 || slashes+2 > at {
		return dsn
	}
	credentials := dsn[slashes+2 : at]
	user, _, found := strings.Cut(credentials, ":")
	if !found {
		return dsn
	}
	return dsn[:slashes+2] + user + ":***" + dsn[at:]
}

func perSecond(n int64, elapsed time.Duration) int64 {
	if elapsed <= 0 {
		return 0
	}
	return int64(float64(n) / elapsed.Seconds())
}

func comma(n int64) string {
	s := fmt.Sprintf("%d", n)
	if n < 0 {
		return "-" + comma(-n)
	}
	if len(s) <= 3 {
		return s
	}

	var b strings.Builder
	lead := len(s) % 3
	if lead > 0 {
		b.WriteString(s[:lead])
		if len(s) > lead {
			b.WriteByte(',')
		}
	}
	for i := lead; i < len(s); i += 3 {
		b.WriteString(s[i : i+3])
		if i+3 < len(s) {
			b.WriteByte(',')
		}
	}
	return b.String()
}
