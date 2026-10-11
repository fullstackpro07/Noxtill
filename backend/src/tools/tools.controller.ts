import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { ToolsService } from './tools.service';
import {
  BreakEvenCalculateDto,
  DiscountCalculateDto,
  InvoiceCalculateDto,
  MarginCalculateDto,
  MissedCallCalculateDto,
  QrEncodeDto,
  ReviewKitComposeDto,
  SignatureRenderDto,
  UtmComposeDto,
  WhatsappComposeDto,
} from './dto/tools.dto';

/** Public endpoints behind the Noxtill 10 Free Tools. */
@Public()
@Controller('public/tools')
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('discount/calculate')
  @HttpCode(HttpStatus.OK)
  calculateDiscount(@Body() dto: DiscountCalculateDto) {
    return this.tools.calculateDiscount(dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('margin/calculate')
  @HttpCode(HttpStatus.OK)
  calculateMargin(@Body() dto: MarginCalculateDto) {
    return this.tools.calculateMargin(dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('break-even/calculate')
  @HttpCode(HttpStatus.OK)
  calculateBreakEven(@Body() dto: BreakEvenCalculateDto) {
    return this.tools.calculateBreakEven(dto);
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('invoice/calculate')
  @HttpCode(HttpStatus.OK)
  calculateInvoice(@Body() dto: InvoiceCalculateDto) {
    return this.tools.calculateInvoice(dto);
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('qr/encode')
  @HttpCode(HttpStatus.OK)
  encodeQr(@Body() dto: QrEncodeDto) {
    return this.tools.encodeQr(dto);
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('review-kit/compose')
  @HttpCode(HttpStatus.OK)
  composeReviewKit(@Body() dto: ReviewKitComposeDto) {
    return this.tools.composeReviewKit(dto);
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('whatsapp/compose')
  @HttpCode(HttpStatus.OK)
  composeWhatsapp(@Body() dto: WhatsappComposeDto) {
    return this.tools.composeWhatsapp(dto);
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('utm/compose')
  @HttpCode(HttpStatus.OK)
  composeUtm(@Body() dto: UtmComposeDto) {
    return this.tools.composeUtm(dto);
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('signature/render')
  @HttpCode(HttpStatus.OK)
  renderSignature(@Body() dto: SignatureRenderDto) {
    return this.tools.renderSignature(dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('missed-call-revenue/calculate')
  @HttpCode(HttpStatus.OK)
  calculateMissedCallRevenue(@Body() dto: MissedCallCalculateDto) {
    return this.tools.calculateMissedCallRevenue(dto);
  }
}
