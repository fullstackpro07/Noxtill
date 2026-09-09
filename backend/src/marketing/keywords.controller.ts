import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { KeywordsService } from './keywords.service';
import { CreateTrackedKeywordDto } from './dto/create-tracked-keyword.dto';
import { BulkAddKeywordsDto } from './dto/bulk-add-keywords.dto';
import { SuggestKeywordsDto } from './dto/suggest-keywords.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('keywords')
export class KeywordsController {
  constructor(private readonly keywordsService: KeywordsService) {}

  @Get()
  list() {
    return this.keywordsService.list();
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTrackedKeywordDto,
  ) {
    return this.keywordsService.create(user.businessId, dto);
  }

  /** Registered before `:id/*` — "bulk"/"suggestions" are static path segments, never matched as an id. */
  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post('bulk')
  bulkCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkAddKeywordsDto,
  ) {
    return this.keywordsService.bulkCreate(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post('suggestions')
  suggest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SuggestKeywordsDto,
  ) {
    return this.keywordsService.suggest(user.businessId, dto);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.keywordsService.remove(id);
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.keywordsService.history(id);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post(':id/check')
  triggerCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.keywordsService.triggerCheck(user.businessId, id);
  }
}
