import { Body, Controller, Get, Post } from '@nestjs/common';
import { HelpService } from './help.service';
import { AskHelpDto } from './help.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('help')
export class HelpController {
  constructor(private readonly helpService: HelpService) {}

  @Post('ask')
  ask(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskHelpDto) {
    return this.helpService.ask(user.businessId, user.sub, dto);
  }

  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthenticatedUser) {
    return this.helpService.suggestions(user.businessId);
  }

  /** Real listing over the same `HelpArticle` table `/help/ask` searches — lets the Help
   * Assistant screen show a browsable grid of what's actually documented, not just answer a typed
   * question. Not tenant-scoped: help articles are shared, business-independent documentation. */
  @Get('articles')
  listArticles() {
    return this.helpService.listArticles();
  }
}
