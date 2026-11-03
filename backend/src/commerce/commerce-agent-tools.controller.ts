import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsObject, IsOptional } from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CommerceAgentToolsService } from './commerce-agent-tools.service';

class RunToolDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, string>;
}

@Controller('commerce/agent-tools')
export class CommerceAgentToolsController {
  constructor(private readonly tools: CommerceAgentToolsService) {}

  @Get()
  registry(@CurrentUser() user: AuthenticatedUser) {
    return this.tools.registry(user.businessId);
  }

  @Get('runs')
  runs(@CurrentUser() user: AuthenticatedUser) {
    return this.tools.runs(user.businessId);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':key/run')
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: RunToolDto,
  ) {
    const input = Object.fromEntries(
      Object.entries(dto.input ?? {}).map(([name, value]) => [
        name,
        String(value).slice(0, 200),
      ]),
    );
    return this.tools.run(user.businessId, user.sub, key, input);
  }
}
