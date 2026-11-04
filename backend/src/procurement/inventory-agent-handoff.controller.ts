import { Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ProcurementService } from './procurement.service';

@Controller('inventory')
export class InventoryAgentHandoffController {
  constructor(private readonly procurement: ProcurementService) {}

  @RequireCapability(CAPABILITIES.PURCHASES_MANAGE)
  @Post('agent-recommendations/:id/purchase-request')
  prepare(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.procurement.createInventoryAgentRequest(user.sub, id);
  }
}
