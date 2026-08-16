import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';

@Controller('products/bundle')
export class BundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  @Post()
  create(@Body() dto: CreateBundleDto) {
    return this.bundlesService.create(dto);
  }

  @Get()
  findAll() {
    return this.bundlesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bundlesService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.bundlesService.remove(id);
  }
}
