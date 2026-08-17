import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { VariantsService } from './variants.service';
import { CreateVariantSetDto } from './dto/create-variant-set.dto';
import { UpdateVariantSetDto } from './dto/update-variant-set.dto';
import { ApplyVariantSetDto } from './dto/apply-variant-set.dto';

@Controller('variants')
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @Post()
  create(@Body() dto: CreateVariantSetDto) {
    return this.variantsService.create(dto);
  }

  @Get()
  findAll() {
    return this.variantsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.variantsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVariantSetDto) {
    return this.variantsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.variantsService.remove(id);
  }

  @Post(':id/apply')
  apply(@Param('id') id: string, @Body() dto: ApplyVariantSetDto) {
    return this.variantsService.apply(id, dto);
  }
}
