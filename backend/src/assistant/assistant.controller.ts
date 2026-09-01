import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AssistantService } from './assistant.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Get('tools')
  tools() {
    return this.assistantService.listTools();
  }

  /**
   * Streamed as Server-Sent Events: each `delta` event is a token of the
   * final answer as it's generated; the stream ends with one `done` event
   * carrying the full text, the tool-call trace, and the conversation id
   * (BE-074, BE-114).
   */
  @Post('chat')
  async chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssistantChatDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const result = await this.assistantService.chat(
        user.businessId,
        user.sub,
        dto.message,
        dto.conversationId,
        (text) => {
          res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
        },
      );
      res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
    } catch (error) {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: (error as Error).message })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.assistantService.listConversations(user.businessId, user.sub);
  }

  @Get('conversations/:id')
  getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.assistantService.getConversation(user.businessId, user.sub, id);
  }

  @Delete('conversations/:id')
  deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.assistantService.deleteConversation(
      user.businessId,
      user.sub,
      id,
    );
  }
}
