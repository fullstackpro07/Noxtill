import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/create-coupon.dto';
import { PreviewCouponDto } from './dto/preview-coupon.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @RequireCapability(CAPABILITIES.COUPONS_MANAGE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCouponDto) {
    return this.coupons.create(user.businessId, dto);
  }

  @Get()
  list() {
    return this.coupons.list();
  }

  // POS checkout preview (Marketing depth fix, UPD-INT-009) — no capability guard, same as
  // `POST /sales` itself: any staff member ringing up a sale can check a coupon code before
  // confirming, they just can't create/edit/delete coupons (that's COUPONS_MANAGE).
  @Post('preview')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewCouponDto,
  ) {
    return this.coupons.preview(
      user.businessId,
      dto.code,
      dto.subtotal,
      dto.customerId,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coupons.findOne(id);
  }

  @RequireCapability(CAPABILITIES.COUPONS_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.coupons.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.COUPONS_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.coupons.remove(id);
  }
}
