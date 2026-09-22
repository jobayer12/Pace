import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';

export type HttpLabel = 'method' | 'route' | 'status_code';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<HttpLabel>;
  readonly httpRequestDuration: Histogram<HttpLabel>;
  readonly httpRequestsInFlight: Gauge<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests handled.',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds.',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Number of HTTP requests currently being served.',
      registers: [this.registry],
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
