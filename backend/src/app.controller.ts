import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { ReadinessService } from './common/health/readiness.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly readiness: ReadinessService,
  ) {}

  /**
   * Root welcome endpoint — accessible at GET / and GET /api/v1.
   */
  @Public()
  @Get(['', 'api/v1'])
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Public health check endpoint — accessible at both GET /health and GET /api/v1/health.
   * Used by Hostinger's uptime monitoring, load balancers, and container health checks.
   * Returns 200 immediately without any DB/Redis I/O so it always responds fast.
   */
  @Public()
  @Get(['health', 'api/v1/health'])
  health(): object {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }

  /**
   * Readiness for external probes and load balancers: 200 only when the database answers (and
   * Redis, when configured); otherwise 503. Component status only — no error details.
   */
  @Public()
  @Get(['health/ready', 'api/v1/health/ready'])
  async ready(@Res() res: Response) {
    const result = await this.readiness.check();
    res.status(result.status === 'ready' ? 200 : 503).json(result);
  }
}
