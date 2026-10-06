import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { LegalPublicService } from './legal-public.service';
import { ConsentRecordDto, LegalFormDto } from './dto/legal-public.dto';

/** Anonymous endpoints behind the public Legal & Trust pages (/contact, /legal/*, /trust/*, /status). */
@Public()
@Controller('public/legal')
export class LegalPublicController {
  constructor(private readonly legal: LegalPublicService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forms')
  @HttpCode(HttpStatus.OK)
  submitForm(@Body() dto: LegalFormDto) {
    return this.legal.submitForm(dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('consent')
  @HttpCode(HttpStatus.OK)
  recordConsent(@Body() dto: ConsentRecordDto) {
    return this.legal.recordConsent(dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('status')
  status() {
    return this.legal.status();
  }
}
