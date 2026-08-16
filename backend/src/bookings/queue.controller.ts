import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { QueueService } from './queue.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('join')
  join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinQueueDto) {
    return this.queueService.join(user.businessId, dto);
  }

  @Get()
  list() {
    return this.queueService.list();
  }

  @Patch(':id/call')
  call(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.queueService.call(user.businessId, id);
  }

  @Patch(':id/serve')
  serve(@Param('id') id: string) {
    return this.queueService.serve(id);
  }

  @Patch(':id/skip')
  skip(@Param('id') id: string) {
    return this.queueService.skip(id);
  }
}
