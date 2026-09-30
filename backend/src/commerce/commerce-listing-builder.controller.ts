import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  ApproveCommerceListingDraftDto,
  CommerceListingDraftQueryDto,
  EditCommerceListingDraftDto,
  GenerateCommerceListingDraftDto,
  RegenerateCommerceListingDraftDto,
} from './dto/commerce-listing-builder.dto';
import { CommerceListingBuilderService } from './commerce-listing-builder.service';
import { CommerceChannelListingsService } from './commerce-channel-listings.service';

@Controller('commerce/listing-builder')
export class CommerceListingBuilderController {
  constructor(
    private readonly listingBuilder: CommerceListingBuilderService,
    private readonly channelListings: CommerceChannelListingsService,
  ) {}

  @Get('channel-listings')
  channelListingHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.channelListings.list(user.businessId);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CommerceListingDraftQueryDto,
  ) {
    return this.listingBuilder.list(user.businessId, query);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.listingBuilder.history(user.businessId, id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.listingBuilder.getOne(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post()
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateCommerceListingDraftDto,
  ) {
    return this.listingBuilder.generate(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/regenerate')
  regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RegenerateCommerceListingDraftDto,
  ) {
    return this.listingBuilder.regenerate(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Patch(':id')
  edit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EditCommerceListingDraftDto,
  ) {
    return this.listingBuilder.edit(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveCommerceListingDraftDto,
  ) {
    return this.listingBuilder.approve(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/sync/:provider')
  syncApprovedDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('provider') provider: string,
  ) {
    return this.channelListings.syncApprovedDraft(
      user.businessId,
      user.sub,
      id,
      provider,
    );
  }
}
