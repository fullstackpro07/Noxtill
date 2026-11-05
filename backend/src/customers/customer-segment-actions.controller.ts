import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CustomerSegmentDraftsService } from './customer-segment-drafts.service';
import { ApproveCustomerSegmentDraftDto } from './dto/customer-segment-draft.dto';

/** Action Center decision; permission, version, payload and audience checks stay in the domain. */
@Controller('actions')
@RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
export class CustomerSegmentActionsController {
  constructor(private readonly drafts: CustomerSegmentDraftsService) {}

  @Post(':id/segment-approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: ApproveCustomerSegmentDraftDto,
  ) {
    const match = /^customer_segment:([0-9a-f-]{36})$/i.exec(id);
    if (!match)
      throw new AppException(
        'CUSTOMER_SEGMENT_ACTION_NOT_FOUND',
        'Customer segment approval not found.',
        HttpStatus.NOT_FOUND,
      );
    return this.drafts.approve(user.sub, match[1], input);
  }
}
