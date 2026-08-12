import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { RejectReturnDto } from './dto/reject-return.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { Role, ReturnStatus } from '../../generated/prisma';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReturnDto) {
    return this.returnsService.create(user.businessId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ReturnStatus,
  ) {
    return this.returnsService.list(user.businessId, status);
  }

  @Roles(Role.owner, Role.manager)
  @Post(':id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returnsService.approve(user.businessId, id);
  }

  @Roles(Role.owner, Role.manager)
  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectReturnDto,
  ) {
    return this.returnsService.reject(user.businessId, id, dto.reason);
  }
}
