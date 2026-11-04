import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CustomerSegmentDraftsService } from './customer-segment-drafts.service';
import {
  RejectCustomerSegmentDraftDto,
  SubmitCustomerSegmentDraftDto,
  UpdateCustomerSegmentDraftDto,
} from './dto/customer-segment-draft.dto';

@Controller('customers')
@RequireCapability(CAPABILITIES.CUSTOMER_AGENT_RUN)
export class CustomerSegmentDraftsController {
  constructor(private readonly drafts: CustomerSegmentDraftsService) {}
  @Get('segment-drafts')
  list() {
    return this.drafts.list();
  }
  @Get('agent-recommendations/:id/segment-draft')
  get(@Param('id') id: string) {
    return this.drafts.get(id);
  }
  @Post('agent-recommendations/:id/segment-draft')
  prepare(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.drafts.prepare(user.sub, id);
  }
  @Patch('agent-recommendations/:id/segment-draft')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: UpdateCustomerSegmentDraftDto,
  ) {
    return this.drafts.update(user.sub, id, input);
  }
  @Post('agent-recommendations/:id/segment-draft/submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: SubmitCustomerSegmentDraftDto,
  ) {
    return this.drafts.submit(user.sub, id, input);
  }
  @Post('agent-recommendations/:id/segment-draft/withdraw')
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: RejectCustomerSegmentDraftDto,
  ) {
    return this.drafts.withdraw(user.sub, id, input);
  }
  @Post('agent-recommendations/:id/segment-draft/reopen')
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: RejectCustomerSegmentDraftDto,
  ) {
    return this.drafts.reopen(user.sub, id, input);
  }
  @Post('agent-recommendations/:id/segment-draft/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: RejectCustomerSegmentDraftDto,
  ) {
    return this.drafts.reject(user.sub, id, input);
  }
}
