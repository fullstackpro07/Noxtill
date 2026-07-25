import { Body, Controller, Get, Post, Res } from '@nestjs/common';
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
   * carrying the full text and the tool-call trace (BE-074).
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
        dto.message,
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
}
