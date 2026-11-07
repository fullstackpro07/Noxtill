import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CommerceB2bAccountStatus } from '@prisma/client';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  CommerceB2bAccountFieldsDto,
  CommerceB2bPriceListItemDto,
  CommerceB2bTierFieldsDto,
  CreateCommerceB2bAccountDto,
  CreateCommerceB2bPriceListDto,
  CreateCommerceB2bTierDto,
  PreviewCommerceB2bQuoteDto,
  SuspendCommerceB2bAccountDto,
  UpdateCommerceB2bPriceListDto,
} from './dto/commerce-b2b.dto';
import { CommerceB2bService } from './commerce-b2b.service';

@Controller('commerce/b2b')
export class CommerceB2bController {
  constructor(private readonly b2b: CommerceB2bService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.b2b.summary(user.businessId);
  }

  @Get('accounts')
  accounts(@CurrentUser() user: AuthenticatedUser) {
    return this.b2b.listAccounts(user.businessId);
  }

  @Get('tiers')
  tiers(@CurrentUser() user: AuthenticatedUser) {
    return this.b2b.listTiers(user.businessId);
  }

  @Get('price-lists')
  priceLists(@CurrentUser() user: AuthenticatedUser) {
    return this.b2b.listPriceLists(user.businessId);
  }

  @Post('accounts/:id/quote-preview')
  previewQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PreviewCommerceB2bQuoteDto,
  ) {
    return this.b2b.previewQuote(user.businessId, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('accounts')
  createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceB2bAccountDto,
  ) {
    return this.b2b.createAccount(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Patch('accounts/:id')
  updateAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceB2bAccountFieldsDto,
  ) {
    return this.b2b.updateAccount(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('accounts/:id/suspend')
  suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuspendCommerceB2bAccountDto,
  ) {
    return this.b2b.setAccountStatus(
      user.businessId,
      user.sub,
      id,
      CommerceB2bAccountStatus.suspended,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('accounts/:id/reactivate')
  reactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.b2b.setAccountStatus(
      user.businessId,
      user.sub,
      id,
      CommerceB2bAccountStatus.active,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('tiers')
  createTier(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceB2bTierDto,
  ) {
    return this.b2b.createTier(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Patch('tiers/:id')
  updateTier(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceB2bTierFieldsDto,
  ) {
    return this.b2b.updateTier(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('price-lists')
  createPriceList(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceB2bPriceListDto,
  ) {
    return this.b2b.createPriceList(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Patch('price-lists/:id')
  updatePriceList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommerceB2bPriceListDto,
  ) {
    return this.b2b.updatePriceList(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('price-lists/:id/items')
  setItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceB2bPriceListItemDto,
  ) {
    return this.b2b.setPriceListItem(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Delete('price-lists/:id/items/:productId')
  removeItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.b2b.removePriceListItem(
      user.businessId,
      user.sub,
      id,
      productId,
    );
  }
}
