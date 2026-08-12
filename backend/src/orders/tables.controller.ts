import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { TablesService } from './tables.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { MoveTableDto } from './dto/move-table.dto';
import { MergeTablesDto } from './dto/merge-tables.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.list(user.businessId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTableDto) {
    return this.tablesService.create(user.businessId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.tablesService.update(user.businessId, id, dto);
  }

  @Post(':id/open')
  open(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tablesService.openTable(user.businessId, id);
  }

  @Post(':id/move')
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MoveTableDto,
  ) {
    return this.tablesService.move(user.businessId, id, dto);
  }

  @Post(':id/merge')
  merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MergeTablesDto,
  ) {
    return this.tablesService.merge(user.businessId, id, dto);
  }
}
