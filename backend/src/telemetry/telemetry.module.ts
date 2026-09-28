import { Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTelemetry } from './tracing';

@Injectable()
class TelemetryShutdown implements OnApplicationShutdown {
  // Runs inside app.close(), before enableShutdownHooks() re-raises the signal,
  // so the last batch of spans and metrics is exported instead of dropped.
  onApplicationShutdown(): Promise<void> {
    return shutdownTelemetry();
  }
}

@Module({ providers: [TelemetryShutdown] })
export class TelemetryModule {}
