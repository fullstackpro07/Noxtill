import { Controller, Delete, Get, Param } from '@nestjs/common';
import { AssistantHistoryService } from './assistant-history.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

/**
 * Unified Chat History — real rows from Business Chat, Help Assistant and Voice Assistant, merged
 * for display. Separate prefix from `AssistantController` (`assistant/chat`, etc.) purely for
 * readability; both live in `AssistantModule`.
 */
@Controller('assistant/history')
export class AssistantHistoryController {
  constructor(private readonly history: AssistantHistoryService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.history.list(user.businessId, user.sub);
  }

  @Get(':kind/:id')
  getDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.history.getDetail(user.businessId, user.sub, kind, id);
  }

  @Delete(':kind/:id')
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.history.delete(user.businessId, user.sub, kind, id);
  }
}
