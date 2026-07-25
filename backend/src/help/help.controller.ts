import { Body, Controller, Post } from '@nestjs/common';
import { HelpService } from './help.service';
import { AskHelpDto } from './help.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('help')
export class HelpController {
  constructor(private readonly helpService: HelpService) {}

  @Post('ask')
  ask(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskHelpDto) {
    return this.helpService.ask(user.businessId, dto);
  }
}
