import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { DatabaseModule } from './database/database.module';
import { HttpLoggerMiddleware } from './logging/http-logger.middleware';
import { buildWinstonOptions } from './logging/winston.config';
import { HttpMetricsMiddleware } from './metrics/http-metrics.middleware';
import { MetricsModule } from './metrics/metrics.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    WinstonModule.forRoot(buildWinstonOptions()),
    DatabaseModule,
    MetricsModule,
    UsersModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(HttpLoggerMiddleware, HttpMetricsMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
