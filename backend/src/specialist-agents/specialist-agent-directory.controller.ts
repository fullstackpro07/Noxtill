import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SpecialistAgentDirectoryService } from './specialist-agent-directory.service';
import { UpdateSpecialistAgentConfigDto } from './dto/update-specialist-agent-config.dto';

@RequireCapability(CAPABILITIES.AI_SETTINGS_MANAGE)
@Controller('agents')
export class SpecialistAgentDirectoryController {
  constructor(private readonly directory: SpecialistAgentDirectoryService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.directory.list(user.businessId);
  }

  @Get(':agentKey/config')
  configuration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentKey') agentKey: string,
  ) {
    return this.directory.configuration(user.businessId, agentKey);
  }

  @Patch(':agentKey/config')
  updateConfiguration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('agentKey') agentKey: string,
    @Body() input: UpdateSpecialistAgentConfigDto,
  ) {
    if (user.role !== Role.owner) {
      throw new AppException(
        'SPECIALIST_AGENT_CONFIG_OWNER_REQUIRED',
        'Only the business owner can change specialist agent configuration.',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.directory.updateConfiguration(
      user.businessId,
      user.sub,
      agentKey,
      input,
    );
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
