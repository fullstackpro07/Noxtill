import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClsService } from 'nestjs-cls';
import { DigitizerService } from './digitizer.service';
import { DigitizerAliasService } from './digitizer-alias.service';
import { DigitizerViewService } from './digitizer-view.service';
import { DigitizerImportService } from './digitizer-import.service';
import { DigitizerInsightsService } from './digitizer-insights.service';
import { DigitizerSettingsService } from './digitizer-settings.service';
import { UploadDigitizerScanDto } from './dto/upload-digitizer-scan.dto';
import { UpdateDigitizerRowDto } from './dto/update-digitizer-row.dto';
import {
  ApproveDocumentsDto,
  AskAssistantDto,
  ReprocessDocumentDto,
  UpdateDigitizerSettingDto,
  UpdateTableDto,
} from './dto/digitizer-actions.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';

/**
 * Every route works on the business the request is acting on — the caller's own, or the branch
 * they switched into via `X-Branch` (resolved by `TenancyGuard` into CLS) — never the raw JWT
 * business, so a branch's documents stay in that branch.
 */
@Controller()
export class DigitizerController {
  constructor(
    private readonly digitizer: DigitizerService,
    private readonly view: DigitizerViewService,
    private readonly importer: DigitizerImportService,
    private readonly insights: DigitizerInsightsService,
    private readonly settings: DigitizerSettingsService,
    private readonly aliases: DigitizerAliasService,
    private readonly cls: ClsService,
  ) {}

  private biz(user: AuthenticatedUser): string {
    return (
      this.cls.get<string | undefined>(CLS_KEY_BUSINESS_ID) ?? user.businessId
    );
  }

  // ── upload & documents ──

  @Post('digitizer/upload')
  @UseInterceptors(FileInterceptor('image'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadDigitizerScanDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('image file is required');
    return this.digitizer.upload(
      this.biz(user),
      user.sub,
      dto.scannerType,
      file,
      dto.groupId,
    );
  }

  @Get('digitizer/documents')
  documents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: Record<string, string>,
  ) {
    return this.view.documents(this.biz(user), {
      status: q.status,
      kind: q.kind,
      destination: q.destination,
      uploaderId: q.uploaderId,
      from: q.from,
      to: q.to,
      q: q.q,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  }

  @Post('digitizer/documents/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApproveDocumentsDto,
  ) {
    return this.digitizer.approve(this.biz(user), user.sub, dto.ids);
  }

  @Get('digitizer/documents/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.digitizer.detail(this.biz(user), id);
  }

  @Get('digitizer/documents/:id/original')
  original(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.digitizer.originalUrl(this.biz(user), id);
  }

  @Post('digitizer/documents/:id/reprocess')
  reprocess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReprocessDocumentDto,
  ) {
    return this.digitizer.reprocess(
      this.biz(user),
      user.sub,
      id,
      dto.scannerType,
    );
  }

  @Post('digitizer/documents/:id/accept-all')
  acceptAll(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.digitizer.acceptAll(this.biz(user), user.sub, id);
  }

  @Patch('digitizer/documents/:id/table')
  updateTable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.digitizer.updateTable(this.biz(user), user.sub, id, dto);
  }

  @Delete('digitizer/documents/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.digitizer.remove(this.biz(user), user.sub, id);
  }

  @Patch('digitizer/documents/:docId/rows/:rowId')
  updateDocumentRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('docId') docId: string,
    @Param('rowId') rowId: string,
    @Body() dto: UpdateDigitizerRowDto,
  ) {
    return this.digitizer.updateRow(
      this.biz(user),
      user.sub,
      rowId,
      dto,
      docId,
    );
  }

  /** The original endpoint's shape — the row's document is found from the row id alone. */
  @Patch('digitizer/rows/:id')
  updateRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDigitizerRowDto,
  ) {
    return this.digitizer.updateRow(this.biz(user), user.sub, id, dto);
  }

  // ── screens ──

  @Get('digitizer/overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.view.overview(this.biz(user));
  }

  @Get('digitizer/queue')
  queue(@CurrentUser() user: AuthenticatedUser) {
    return this.view.queue(this.biz(user));
  }

  @Get('digitizer/review')
  review(@CurrentUser() user: AuthenticatedUser) {
    return this.view.review(this.biz(user));
  }

  @Get('digitizer/structured')
  structured(
    @CurrentUser() user: AuthenticatedUser,
    @Query('destination') destination?: string,
    @Query('documentId') documentId?: string,
  ) {
    return this.view.structured(this.biz(user), destination, documentId);
  }

  @Get('digitizer/import')
  importOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('documentId') documentId?: string,
  ) {
    return this.view.importOverview(this.biz(user), documentId);
  }

  @Get('digitizer/batches')
  batches(
    @CurrentUser() user: AuthenticatedUser,
    @Query('groupId') groupId?: string,
  ) {
    return this.view.batches(this.biz(user), groupId);
  }

  /** `POST /imports/:id/commit` (UPD-BE-062) — writes exactly the rows the preview promised. */
  @Post('imports/:id/commit')
  commit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.importer.commit(this.biz(user), user.sub, id);
  }

  // ── assistant ──

  @Get('digitizer/assistant')
  assistant(@CurrentUser() user: AuthenticatedUser) {
    return this.insights.overview(this.biz(user));
  }

  @Post('digitizer/assistant/ask')
  ask(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskAssistantDto) {
    return this.insights.ask(this.biz(user), dto);
  }

  // ── settings & learned corrections ──

  @Get('digitizer/settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(this.biz(user));
  }

  @Patch('digitizer/settings')
  updateSetting(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDigitizerSettingDto,
  ) {
    return this.settings.set(this.biz(user), dto.key, dto.value);
  }

  @Get('digitizer/aliases')
  listAliases(@CurrentUser() user: AuthenticatedUser) {
    return this.aliases.list(this.biz(user));
  }

  @Delete('digitizer/aliases/:id')
  removeAlias(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.aliases.remove(this.biz(user), id);
  }
}
