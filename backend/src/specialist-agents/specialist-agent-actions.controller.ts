import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ListSpecialistAgentActionsDto } from './dto/list-specialist-agent-actions.dto';
import { DecideSpecialistAgentActionDto } from './dto/decide-specialist-agent-action.dto';
import { SpecialistAgentActionsService } from './specialist-agent-actions.service';

@RequireCapability(CAPABILITIES.AI_SETTINGS_MANAGE)
@Controller('agent-actions')
export class SpecialistAgentActionsController {
  constructor(private readonly actions: SpecialistAgentActionsService) {}

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    this.assertOwner(user);
    return this.actions.get(user.businessId, id, user.sub);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSpecialistAgentActionsDto,
  ) {
    this.assertOwner(user);
    return this.actions.list(user.businessId, query);
  }

  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: DecideSpecialistAgentActionDto,
  ) {
    this.assertOwner(user);
    return this.actions.approve(user.businessId, user.sub, id, input);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: DecideSpecialistAgentActionDto,
  ) {
    this.assertOwner(user);
    return this.actions.reject(user.businessId, user.sub, id, input);
  }

  @Post(':id/execute')
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: DecideSpecialistAgentActionDto,
  ) {
    this.assertOwner(user);
    return this.actions.execute(user.businessId, user.sub, id, input);
  }

  @Post(':id/source-rfq')
  sourceRfq(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: DecideSpecialistAgentActionDto,
  ) {
    this.assertOwner(user);
    return this.actions.sourceRfq(user.businessId, user.sub, id, input);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: DecideSpecialistAgentActionDto,
  ) {
    this.assertOwner(user);
    return this.actions.cancel(user.businessId, user.sub, id, input);
  }

  @Post(':id/resolve')
  resolveUnknownOutcome(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: DecideSpecialistAgentActionDto,
  ) {
    this.assertOwner(user);
    return this.actions.resolveUnknownOutcome(
      user.businessId,
      user.sub,
      id,
      input,
    );
  }

  private assertOwner(user: AuthenticatedUser) {
    if (user.role === Role.owner) return;
    throw new AppException(
      'SPECIALIST_ACTIONS_OWNER_REQUIRED',
      'Only the business owner can review the cross-module specialist action lifecycle.',
      HttpStatus.FORBIDDEN,
    );
  }
}
