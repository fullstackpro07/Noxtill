import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

/** UPD-BE-107 fix-it: no capability gate previously existed despite this being real financial CRUD. */
@RequireCapability(CAPABILITIES.PROFIT_VIEW)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Post()
  create(@Body() dto: CreateExpenseDto) {
    return this.expensesService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryExpensesDto) {
    return this.expensesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(id, dto);
  }

  @RequireCapability(CAPABILITIES.EXPENSES_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.expensesService.remove(id);
  }
}
