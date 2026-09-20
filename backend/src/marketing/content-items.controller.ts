import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ContentItemsService } from './content-items.service';
import {
  CreateContentItemDto,
  UpdateContentItemDto,
} from './dto/create-content-item.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('content-items')
export class ContentItemsController {
  constructor(private readonly contentItems: ContentItemsService) {}

  @RequireCapability(CAPABILITIES.CONTENT_PLANNER_MANAGE)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContentItemDto,
  ) {
    return this.contentItems.create(user.businessId, dto);
  }

  @Get()
  list() {
    return this.contentItems.list();
  }

  @Get('ideas')
  ideas(@CurrentUser() user: AuthenticatedUser) {
    return this.contentItems.ideas(user.businessId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contentItems.findOne(id);
  }

  @RequireCapability(CAPABILITIES.CONTENT_PLANNER_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContentItemDto) {
    return this.contentItems.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.CONTENT_PLANNER_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contentItems.remove(id);
  }
}
