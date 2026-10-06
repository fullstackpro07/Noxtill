import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CtEsignService } from './ct-esign.service';
import { PublicDeclineDto, PublicSignDto } from './dto/ct.dto';

const ua = (r: Request) =>
  (r.headers['user-agent'] ?? '').toString().slice(0, 255) || null;

/**
 * Public Noxtill eSign page. No staff auth: the signer's personal link token identifies exactly
 * one signer on one request. Responses never include other signers' emails or evidence.
 */
@Public()
@Controller('public/sign')
export class ContractsPublicController {
  constructor(private readonly esign: CtEsignService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  view(@Param('token') token: string, @Req() req: Request) {
    return this.esign.view(token, req.ip ?? null, ua(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':token/otp')
  otp(@Param('token') token: string) {
    return this.esign.sendOtp(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/sign')
  sign(
    @Param('token') token: string,
    @Body() b: PublicSignDto,
    @Req() req: Request,
  ) {
    return this.esign.sign(token, b, req.ip ?? null, ua(req));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/decline')
  decline(
    @Param('token') token: string,
    @Body() b: PublicDeclineDto,
    @Req() req: Request,
  ) {
    return this.esign.decline(token, b.reason, req.ip ?? null);
  }
}
