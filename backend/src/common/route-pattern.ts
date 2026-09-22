import type { Request } from 'express';

export const UNMATCHED_ROUTE = 'unmatched';

export const routePattern = (req: Request): string => {
  const path = (req as Request & { route?: { path?: string } }).route?.path;

  if (path === undefined || path.includes('*')) {
    return UNMATCHED_ROUTE;
  }

  return path;
};
