import type { Request } from 'express';

/**
 * Requests that matched no handler (404s) are bucketed under one constant.
 */
export const UNMATCHED_ROUTE = 'unmatched';

/**
 * Resolves the Express *route pattern* for a request, e.g. `/api/users/:id`.
 *
 * This matters for the Prometheus `route` label: labelling by `req.originalUrl`
 * would mint a new time series for every user id and every email address ever
 * requested, which is the classic way to blow up cardinality and take down a
 * Prometheus server. The pattern keeps the label set bounded by the number of
 * declared routes.
 *
 * `req.route` is only populated once a handler has matched, which is true by
 * the time the response emits 'finish' -- so this must not be called earlier.
 */
export const routePattern = (req: Request): string => {
  const path = (req as Request & { route?: { path?: string } }).route?.path;

  // When no controller route matched, Express reports the observability
  // middleware's own wildcard mount ("/api/{*path}") here. Collapse anything
  // containing a wildcard to one readable constant, so the label reads as what
  // it means rather than leaking an internal mount pattern. No declared route
  // contains a wildcard, so this cannot swallow a real one.
  if (path === undefined || path.includes('*')) {
    return UNMATCHED_ROUTE;
  }

  return path;
};
