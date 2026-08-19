import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Unauthenticated root route — a real, if minor, gap found by INT-015's e2e suite: this was silently 401ing behind the global JwtAuthGuard, unsuitable as a basic health/uptime check. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Public health check endpoint — accessible at GET /api/v1/health.
   * Used by Hostinger's uptime monitoring and load balancers.
   * Returns 200 immediately without any DB/Redis I/O so it always responds fast.
   */
  @Public()
  @Get('health')
  health(): object {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }
}
