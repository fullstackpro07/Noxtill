import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { WorkflowDeadLetterStatus } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { DecideWorkflowDeadLetterDto } from './dto/decide-workflow-dead-letter.dto';
import { WorkflowDeadLettersService } from './workflow-dead-letters.service';

@Controller('workflows/recovery/dead-letters')
@RequireCapability(CAPABILITIES.AUTOMATIONS_MANAGE)
export class WorkflowDeadLettersController {
  constructor(private readonly deadLetters: WorkflowDeadLettersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: WorkflowDeadLetterStatus,
  ) {
    return this.deadLetters.list(
      user.businessId,
      status ?? WorkflowDeadLetterStatus.open,
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.deadLetters.findOne(user.businessId, id);
  }

  @Post(':id/retry')
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideWorkflowDeadLetterDto,
  ) {
    return this.deadLetters.retry(user, id, dto);
  }

  @Post(':id/resolve')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideWorkflowDeadLetterDto,
  ) {
    return this.deadLetters.resolve(user, id, dto);
  }

  @Post(':id/dismiss')
  dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideWorkflowDeadLetterDto,
  ) {
    return this.deadLetters.dismiss(user, id, dto);
  }
}
