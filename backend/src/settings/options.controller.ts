import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { OptionsService } from './options.service';
import {
  CreateOptionDto,
  CreateOptionSetDto,
  ReorderOptionsDto,
  UpdateOptionDto,
} from './dto/option-set.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('options')
export class OptionsController {
  constructor(private readonly options: OptionsService) {}

  @RequireCapability(CAPABILITIES.OPTIONS_MANAGE)
  @Post()
  createSet(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOptionSetDto,
  ) {
    return this.options.createSet(user.businessId, dto);
  }

  @Get()
  listAll() {
    return this.options.listAll();
  }

  @RequireCapability(CAPABILITIES.OPTIONS_MANAGE)
  @Post(':setKey/items')
  addOption(@Param('setKey') setKey: string, @Body() dto: CreateOptionDto) {
    return this.options.addOption(setKey, dto);
  }

  @RequireCapability(CAPABILITIES.OPTIONS_MANAGE)
  @Patch(':setKey/items/:id')
  updateOption(
    @Param('setKey') setKey: string,
    @Param('id') id: string,
    @Body() dto: UpdateOptionDto,
  ) {
    return this.options.updateOption(setKey, id, dto);
  }

  @RequireCapability(CAPABILITIES.OPTIONS_MANAGE)
  @Delete(':setKey/items/:id')
  removeOption(@Param('setKey') setKey: string, @Param('id') id: string) {
    return this.options.removeOption(setKey, id);
  }

  @RequireCapability(CAPABILITIES.OPTIONS_MANAGE)
  @Patch(':setKey/reorder')
  reorder(@Param('setKey') setKey: string, @Body() dto: ReorderOptionsDto) {
    return this.options.reorder(setKey, dto);
  }
}
