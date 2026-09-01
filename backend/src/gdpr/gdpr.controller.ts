import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GdprService } from './gdpr.service';
import { CreateDsrRequestDto } from './dto/create-dsr-request.dto';
import {
  FulfillDsrRequestDto,
  RejectDsrRequestDto,
} from './dto/fulfill-dsr-request.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { DsrRequestStatus } from '@prisma/client';

@RequireCapability(CAPABILITIES.GDPR_MANAGE)
@Controller('gdpr/requests')
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDsrRequestDto,
  ) {
    return this.gdpr.create(user.businessId, user.sub, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: DsrRequestStatus,
  ) {
    return this.gdpr.list(user.businessId, status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.gdpr.findOne(user.businessId, id);
  }

  @Patch(':id/in-progress')
  markInProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.gdpr.markInProgress(user.businessId, id);
  }

  @Post(':id/fulfill')
  fulfill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FulfillDsrRequestDto,
  ) {
    return this.gdpr.fulfill(user.businessId, id, dto);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectDsrRequestDto,
  ) {
    return this.gdpr.reject(user.businessId, id, dto);
  }
}
