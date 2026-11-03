import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommerceRfqStatus } from '@prisma/client';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  AwardCommerceRfqDto,
  CloseCommerceRfqDto,
  CommerceRfqVersionDto,
  CreateCommerceRfqDto,
  MarkRfqSuppliersSentDto,
  RecordCommerceSupplierQuoteDto,
  UpdateCommerceRfqDto,
} from './dto/commerce-rfq.dto';
import { CommerceRfqsService } from './commerce-rfqs.service';

@Controller('commerce/rfqs')
export class CommerceRfqsController {
  constructor(private readonly rfqs: CommerceRfqsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: CommerceRfqStatus,
    @Query('search') search?: string,
  ) {
    return this.rfqs.list(user.businessId, { status, search });
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rfqs.getOne(user.businessId, id);
  }

  @Get(':id/audit')
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rfqs.history(user.businessId, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/close')
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseCommerceRfqDto,
  ) {
    return this.rfqs.close(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseCommerceRfqDto,
  ) {
    return this.rfqs.cancel(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceRfqDto,
  ) {
    return this.rfqs.create(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommerceRfqDto,
  ) {
    return this.rfqs.update(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/open')
  open(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceRfqVersionDto,
  ) {
    return this.rfqs.open(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/confirm-manual-supplier-send')
  confirmManualSupplierSend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MarkRfqSuppliersSentDto,
  ) {
    return this.rfqs.confirmManualSupplierSend(
      user.businessId,
      user.sub,
      id,
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/quotes')
  recordQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RecordCommerceSupplierQuoteDto,
  ) {
    return this.rfqs.recordQuote(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/quotes/:quoteId/shortlist')
  shortlistQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
    @Body() dto: CommerceRfqVersionDto,
  ) {
    return this.rfqs.updateQuoteStatus(
      user.businessId,
      user.sub,
      id,
      quoteId,
      'shortlist',
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/quotes/:quoteId/reject')
  rejectQuote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('quoteId') quoteId: string,
    @Body() dto: CommerceRfqVersionDto,
  ) {
    return this.rfqs.updateQuoteStatus(
      user.businessId,
      user.sub,
      id,
      quoteId,
      'reject',
      dto,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post(':id/actions/award')
  award(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AwardCommerceRfqDto,
  ) {
    return this.rfqs.award(user.businessId, user.sub, id, dto);
  }
}
