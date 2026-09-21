import { Controller, Get, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /**
   * Prometheus scrape endpoint. Served outside the global `/api` prefix at
   * `GET /metrics`, which is where scrapers look by default.
   *
   * Uses @Res directly because the body is Prometheus' line-based text
   * exposition format, not JSON.
   */
  @Get()
  @ApiOperation({
    summary: 'Prometheus scrape endpoint',
    description:
      'Returns the Prometheus text exposition format, not JSON. Served outside the /api prefix.',
  })
  @ApiOkResponse({
    content: {
      'text/plain': {
        schema: { type: 'string' },
        example: 'http_requests_total{method="GET",route="/api/users",status_code="200"} 42',
      },
    },
  })
  async scrape(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.scrape());
  }
}
