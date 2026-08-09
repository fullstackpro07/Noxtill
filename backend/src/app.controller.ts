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
}
