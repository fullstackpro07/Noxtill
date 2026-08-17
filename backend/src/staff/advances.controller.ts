import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AdvancesService } from './advances.service';
import { CreateAdvanceDto, UpdateAdvanceDto } from './dto/create-advance.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller()
@RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
export class AdvancesController {
  constructor(private readonly advances: AdvancesService) {}

  @Post('staff/:id/advances')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') staffUserId: string,
    @Body() dto: CreateAdvanceDto,
  ) {
    return this.advances.create(user.businessId, staffUserId, dto);
  }

  @Get('staff/:id/advances')
  list(@Param('id') staffUserId: string) {
    return this.advances.list(staffUserId);
  }

  @Patch('staff/:id/advances/:advanceId')
  update(@Param('advanceId') advanceId: string, @Body() dto: UpdateAdvanceDto) {
    return this.advances.update(advanceId, dto);
  }

  @Delete('staff/:id/advances/:advanceId')
  cancel(@Param('advanceId') advanceId: string) {
    return this.advances.cancel(advanceId);
  }
}
