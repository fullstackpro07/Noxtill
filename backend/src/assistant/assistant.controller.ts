import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AssistantService } from './assistant.service';
import { AssistantAttachmentService } from './attachment.service';
import { AssistantReportService } from './assistant-report.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { GenerateReportDto } from './dto/generate-report.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistantService: AssistantService,
    private readonly attachments: AssistantAttachmentService,
    private readonly reports: AssistantReportService,
  ) {}

  /** Business Chat's "Generate report" action — a real one-page PDF built from exactly the
   * tool-call trace and help sources the caller's own answer already carried. */
  @Post('report')
  generateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateReportDto,
  ) {
    return this.reports.generate(user, dto);
  }

  /**
   * Reads a PDF, Word document, CSV/text file or photo into plain text so the caller can prepend
   * it to their next `/assistant/chat` question. Read-only: nothing from the file is written to
   * any business table (that is the Photo Digitizer's separate, confirmed-import flow).
   */
  @Post('attachments')
  @UseInterceptors(FileInterceptor('file'))
  extractAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.attachments.extract(user.businessId, file);
  }

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
