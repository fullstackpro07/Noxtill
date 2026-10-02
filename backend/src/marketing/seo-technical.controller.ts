import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SeoTechnicalActionType } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoTechnicalService } from './seo-technical.service';

class CreateTechnicalActionDto {
  @IsEnum(SeoTechnicalActionType)
  type!: SeoTechnicalActionType;

  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  sourceUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  targetValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  issueId?: string;
}

class TransitionTechnicalActionDto {
  @IsIn(['approval_required', 'approved', 'rejected', 'applied', 'cancelled'])
  status!:
    'approval_required' | 'approved' | 'rejected' | 'applied' | 'cancelled';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

@Controller('seo-autopilot/technical')
export class SeoTechnicalController {
  constructor(private readonly technical: SeoTechnicalService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.technical.overview(user.businessId);
  }

  @Get('actions')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.technical.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('actions/validate')
  validate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTechnicalActionDto,
  ) {
    return this.technical.validate(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('actions')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTechnicalActionDto,
  ) {
    return this.technical.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('actions/:id/status')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransitionTechnicalActionDto,
  ) {
    return this.technical.transition(
      user.businessId,
      user.sub,
      id,
      dto.status,
      dto.note,
    );
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('verify')
  verify(@CurrentUser() user: AuthenticatedUser) {
    return this.technical.verifyApplied(user.businessId);
  }
}
