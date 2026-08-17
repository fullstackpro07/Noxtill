import { Body, Controller, Get, Patch } from '@nestjs/common';
import { TerminologyService } from './terminology.service';
import { SetLabelsDto } from './dto/set-labels.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('labels')
export class TerminologyController {
  constructor(private readonly terminology: TerminologyService) {}

  @Get()
  getAll(@CurrentUser() user: AuthenticatedUser) {
    return this.terminology.getAll(user.businessId);
  }

  @RequireCapability(CAPABILITIES.LABELS_MANAGE)
  @Patch()
  setMany(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetLabelsDto) {
    return this.terminology.setMany(user.businessId, dto.updates);
  }
}
