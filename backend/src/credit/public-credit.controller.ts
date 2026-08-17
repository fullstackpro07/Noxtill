import { Controller, Get, Param } from '@nestjs/common';
import { PublicCreditService } from './public-credit.service';
import { Public } from '../common/decorators/public.decorator';

@Controller()
export class PublicCreditController {
  constructor(private readonly publicCreditService: PublicCreditService) {}

  @Public()
  @Get('credit/ledger/:token')
  getByToken(@Param('token') token: string) {
    return this.publicCreditService.getByToken(token);
  }
}
