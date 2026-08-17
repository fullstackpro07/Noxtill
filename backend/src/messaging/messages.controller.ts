import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { SendGateService } from './send-gate.service';
import { MessagesService } from './messages.service';
import { TestMessageDto } from './dto/test-message.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly sendGate: SendGateService,
    private readonly messagesService: MessagesService,
  ) {}

  @RequireCapability(CAPABILITIES.MESSAGING_SEND_TEST)
  @Post('test')
  test(@CurrentUser() user: AuthenticatedUser, @Body() dto: TestMessageDto) {
    return this.sendGate.send({
      businessId: user.businessId,
      customerId: dto.customerId,
      to: dto.customerId ? undefined : { phone: dto.phone, email: dto.email },
      templateKey: dto.templateKey,
      variables: dto.variables ?? {},
    });
  }

  @Get()
  list(@Query('customer_id') customerId: string) {
    return this.messagesService.listByCustomer(customerId);
  }
}
