import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ReorderCategoriesDto } from './dto/reorder-categories.dto';
import { MergeCategoryDto } from './dto/merge-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  /** Declared before `:id` so they aren't swallowed by that param route. */
  @Patch('reorder')
  reorder(@Body() dto: ReorderCategoriesDto) {
    return this.categoriesService.reorder(dto);
  }

  @Get('revenue')
  revenueByCategory() {
    return this.categoriesService.revenueByCategory();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }

  @Post(':id/merge')
  merge(@Param('id') id: string, @Body() dto: MergeCategoryDto) {
    return this.categoriesService.merge(id, dto.targetCategoryId);
  }
}
