import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SpecialistAgentDirectoryService } from './specialist-agent-directory.service';

@RequireCapability(CAPABILITIES.AI_SETTINGS_MANAGE)
@Controller('agents')
export class SpecialistAgentDirectoryController {
  constructor(private readonly directory: SpecialistAgentDirectoryService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.directory.list(user.businessId);
  }

  @Get(':agentKey/configuration-history')
  configurationHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentKey') agentKey: string,
    @Query('limit') limit?: string,
  ) {
    if (user.role !== Role.owner) {
      throw new AppException(
        'SPECIALIST_AGENT_CONFIG_OWNER_REQUIRED',
        'Only the business owner can review specialist agent configuration history.',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.directory.configurationHistory(
      user.businessId,
      agentKey,
      limit,
    );
  }
}
