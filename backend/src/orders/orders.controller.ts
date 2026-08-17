import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { InvoiceService } from './invoice.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { HoldSaleDto } from './dto/hold-sale.dto';
import { ResumeHeldSaleDto } from './dto/resume-held-sale.dto';
import { SplitBillDto } from './dto/split-bill.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { OrderStatus } from '@prisma/client';

@Controller()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly invoiceService: InvoiceService,
  ) {}

  // Not @Audited() here: OrdersService.createSale writes its audit_log row
  // inside the same DB transaction as the sale itself, for true atomicity —
  // the generic post-response interceptor would only add a redundant entry.
  @Post('sales')
  createSale(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSaleDto,
  ) {
    return this.ordersService.createSale(user.businessId, dto);
  }

  @Get('orders')
  findAll(@Query('status') status?: OrderStatus) {
    return this.ordersService.findAll(status);
  }

  @Get('orders/:id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  // UPD-BE-009: a draft is a real Order row (status "draft") — list via GET /orders?status=draft.
  @Post('orders/draft')
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: HoldSaleDto,
  ) {
    return this.ordersService.createDraft(user.businessId, dto);
  }

  @Post('orders/:id/convert')
  convertDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResumeHeldSaleDto,
  ) {
    return this.ordersService.convertDraft(user.businessId, id, dto);
  }

  @Patch('orders/:id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(user.businessId, id, dto.status);
  }

  @Post('orders/:id/split-bill')
  splitBill(@Param('id') id: string, @Body() dto: SplitBillDto) {
    return this.ordersService.splitBill(id, dto.parts);
  }

  @Post('orders/:id/invoice')
  generateInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenerateInvoiceDto,
  ) {
    return this.invoiceService.generate(user.businessId, id, dto.send);
  }
}
