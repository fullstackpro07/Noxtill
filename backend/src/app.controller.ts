import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

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
}
