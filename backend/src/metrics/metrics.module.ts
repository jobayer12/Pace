import { Module } from '@nestjs/common';
import { DbMetricsService } from './db-metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, DbMetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
