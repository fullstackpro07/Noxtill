import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { Allow, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SettingsHubService } from './hub.service';

class ChangeDto {
  @IsString()
  category!: string;

  @IsString()
  rowKey!: string;

  /** null clears an optional limit. */
  @Allow()
  value!: string | number | boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

class SaveChangesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChangeDto)
  changes!: ChangeDto[];
}

class MatrixDto {
  @IsString()
  event!: string;

  @IsIn(['in_app', 'email', 'whatsapp', 'sms'])
  channel!: string;

  @IsBoolean()
  on!: boolean;
}

/** The Settings hub. Every value is read from the module that owns it and every change is audited. */
@Controller('settings/hub')
export class SettingsHubController {
  constructor(private readonly hub: SettingsHubService) {}

  @Get('categories')
  async categories(@CurrentUser() user: AuthenticatedUser) {
    return this.hub.categories(await this.hub.ctxFor(user));
  }

  @Get('categories/:key')
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.hub.detail(key, await this.hub.ctxFor(user));
  }

  @Get('categories/:key/history')
  async categoryHistory(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.hub.categoryHistory(await this.hub.ctxFor(user), key);
  }

  @Post('categories/:key/reset')
  async resetCategory(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.hub.resetCategory(await this.hub.ctxFor(user), key);
  }

  @Get('diagnostics')
  async diagnostics(@CurrentUser() user: AuthenticatedUser) {
    return this.hub.diagnostics(await this.hub.ctxFor(user));
  }

  /** Personal interface preferences — available to every signed-in user, so no settings access is needed. */
  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.hub.preferences(user.sub);
  }

  @Get('home')
  async home(@CurrentUser() user: AuthenticatedUser) {
    return this.hub.home(await this.hub.ctxFor(user));
  }

  @Get('health')
  async health(@CurrentUser() user: AuthenticatedUser) {
    return this.hub.health(await this.hub.ctxFor(user));
  }

  @Get('search')
  async search(@CurrentUser() user: AuthenticatedUser, @Query('q') q = '') {
    return this.hub.search(await this.hub.ctxFor(user), q);
  }

  @Put('changes')
  async save(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveChangesDto) {
    return this.hub.saveChanges(await this.hub.ctxFor(user), dto.changes);
  }

  @Get('rows/:category/:row/history')
  async rowHistory(@CurrentUser() user: AuthenticatedUser, @Param('category') category: string, @Param('row') row: string) {
    return this.hub.rowHistory(await this.hub.ctxFor(user), category, row);
  }

  @Post('rows/:category/:row/reset')
  async resetRow(@CurrentUser() user: AuthenticatedUser, @Param('category') category: string, @Param('row') row: string) {
    return this.hub.resetRow(await this.hub.ctxFor(user), category, row);
  }

  @Post('rows/:category/:row/restore/:entryId')
  async restore(@CurrentUser() user: AuthenticatedUser, @Param('category') category: string, @Param('row') row: string, @Param('entryId') entryId: string) {
    return this.hub.restore(await this.hub.ctxFor(user), category, row, entryId);
  }

  @Post('rows/:category/:row/opened')
  async opened(@CurrentUser() user: AuthenticatedUser, @Param('category') category: string, @Param('row') row: string) {
    return this.hub.opened(await this.hub.ctxFor(user), category, row);
  }

  @Put('pins/:category/:row')
  async pin(@CurrentUser() user: AuthenticatedUser, @Param('category') category: string, @Param('row') row: string) {
    return this.hub.pin(await this.hub.ctxFor(user), category, row);
  }

  @Post('actions/:actionKey')
  async action(@CurrentUser() user: AuthenticatedUser, @Param('actionKey') actionKey: string) {
    return this.hub.runAction(await this.hub.ctxFor(user), actionKey);
  }

  @Post('ask/:key')
  async ask(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.hub.ask(await this.hub.ctxFor(user), key);
  }

  @Put('notifications/matrix')
  async matrix(@CurrentUser() user: AuthenticatedUser, @Body() dto: MatrixDto) {
    return this.hub.toggleMatrix(await this.hub.ctxFor(user), dto.event, dto.channel, dto.on);
  }
}
