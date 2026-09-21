import type { Request } from 'express';

/**
 * Paths that are skipped by both the access log and the HTTP metrics
 * middleware. The Prometheus scrape endpoint is the only entry: at a typical
 * 15s scrape interval it would otherwise dominate the access log, and
 * measuring the metrics endpoint with its own metrics is circular noise.
 *
 * This is enforced here rather than with MiddlewareConsumer.exclude() because
 * the consumer resolves exclusion paths against the global `/api` prefix, so
 * `/metrics` -- which is deliberately mounted outside that prefix -- can never
 * be matched by it.
 */
const EXCLUDED_PATHS: ReadonlySet<string> = new Set(['/metrics']);

export const isObservabilityExcluded = (req: Request): boolean => EXCLUDED_PATHS.has(req.path);
