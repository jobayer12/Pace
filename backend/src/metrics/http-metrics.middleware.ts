import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { isObservabilityExcluded } from '../common/observability-exclusions';
import { onResponseFinalised } from '../common/response-finalised';
import { routePattern } from '../common/route-pattern';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (isObservabilityExcluded(req)) {
      next();
      return;
    }

    const stopTimer = this.metrics.httpRequestDuration.startTimer();
    this.metrics.httpRequestsInFlight.inc();

    onResponseFinalised(res, () => {
      const labels = {
        method: req.method,
        route: routePattern(req),
        status_code: String(res.statusCode),
      };

      this.metrics.httpRequestsInFlight.dec();
      this.metrics.httpRequestsTotal.inc(labels);
      stopTimer(labels);
    });

    next();
  }
}
