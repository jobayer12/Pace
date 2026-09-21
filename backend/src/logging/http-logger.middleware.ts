import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import type { Logger } from 'winston';
import { isObservabilityExcluded } from '../common/observability-exclusions';
import { onResponseFinalised } from '../common/response-finalised';
import { routePattern } from '../common/route-pattern';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (isObservabilityExcluded(req)) {
      next();
      return;
    }

    // Honour an inbound correlation id so a request can be traced across
    // services; mint one otherwise. Echoed back so the caller can quote it.
    const inbound = req.headers[REQUEST_ID_HEADER];
    const requestId = (Array.isArray(inbound) ? inbound[0] : inbound) || randomUUID();
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const startedAt = process.hrtime.bigint();

    onResponseFinalised(res, () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const { statusCode } = res;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      const contentLength = Number(res.getHeader('content-length'));

      this.logger.log(level, `${req.method} ${req.originalUrl} ${statusCode}`, {
        context: 'HTTP',
        requestId,
        method: req.method,
        url: req.originalUrl,
        route: routePattern(req),
        statusCode,
        durationMs: Number(durationMs.toFixed(3)),
        ip: req.ip,
        userAgent: req.get('user-agent'),
        contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
      });
    });

    next();
  }
}
