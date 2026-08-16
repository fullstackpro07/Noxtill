import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { KeywordsService } from './keywords.service';
import { CreateTrackedKeywordDto } from './dto/create-tracked-keyword.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('keywords')
export class KeywordsController {
  constructor(private readonly keywordsService: KeywordsService) {}

  @Get()
  list() {
    return this.keywordsService.list();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTrackedKeywordDto,
  ) {
    return this.keywordsService.create(user.businessId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.keywordsService.remove(id);
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.keywordsService.history(id);
  }

  @Post(':id/check')
  triggerCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.keywordsService.triggerCheck(user.businessId, id);
  }
}
