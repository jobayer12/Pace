import type { Request } from 'express';

const EXCLUDED_PATHS: ReadonlySet<string> = new Set(['/metrics']);

export const isObservabilityExcluded = (req: Request): boolean => EXCLUDED_PATHS.has(req.path);
