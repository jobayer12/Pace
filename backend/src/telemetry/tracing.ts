// Loaded before anything else in main.ts: auto-instrumentation can only patch
// modules (http, express, pg, knex, winston) that are required after it starts.
import 'dotenv/config';
import { hostname } from 'node:os';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Emit the stable `http.server.request.duration` histogram (seconds) rather
// than the legacy `http.server.duration` (milliseconds).
process.env.OTEL_SEMCONV_STABILITY_OPT_IN ??= 'http';
// Logs already reach Loki through Alloy tailing stdout; don't ship them twice.
process.env.OTEL_LOGS_EXPORTER ??= 'none';

const TRACE_IGNORED_PATHS = ['/metrics', '/docs'];

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME ?? 'backend',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? 'unknown',
    // Every cluster worker exports its own metrics. Without a distinct
    // instance id they would write the same Prometheus series and clobber
    // each other.
    'service.instance.id': `${hostname()}-${process.pid}`,
  }),
  // Endpoint comes from OTEL_EXPORTER_OTLP_ENDPOINT (default http://localhost:4318).
  traceExporter: new OTLPTraceExporter(),
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 15_000),
    }),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) =>
          TRACE_IGNORED_PATHS.some((path) => req.url?.startsWith(path)),
      },
      // Adds trace_id/span_id to each Winston log line so Loki logs link to traces.
      '@opentelemetry/instrumentation-winston': { disableLogSending: true },
      // One span per DNS lookup / socket is noise for an HTTP API.
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

// A no-op when OTEL_SDK_DISABLED=true.
sdk.start();

// Flushes buffered spans and metrics; called from Nest's shutdown hook.
export const shutdownTelemetry = (): Promise<void> => sdk.shutdown();
