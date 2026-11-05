import { Controller, Get, Header, Param } from '@nestjs/common';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CustomerProfileIntelligenceService } from './customer-profile-intelligence.service';

@Controller('customers')
export class CustomerProfileIntelligenceController {
  constructor(
    private readonly intelligence: CustomerProfileIntelligenceService,
  ) {}

  @Get(':id/intelligence')
  @Header('Cache-Control', 'no-store')
  @RequireCapability(CAPABILITIES.CUSTOMER_AGENT_RUN)
  review(@Param('id') id: string) {
    return this.intelligence.review(id);
  }
}
