import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { SendGateService } from './send-gate.service';
import { MessagesService } from './messages.service';
import { TestMessageDto } from './dto/test-message.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { Role } from '../../generated/prisma';

@Controller('messages')
export class MessagesController {
  constructor(
    private readonly sendGate: SendGateService,
    private readonly messagesService: MessagesService,
  ) {}

  @Roles(Role.owner)
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
