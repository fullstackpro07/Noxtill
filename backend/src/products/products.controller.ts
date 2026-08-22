import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { CommitImportDto } from './dto/import-mapping.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productsImportService: ProductsImportService,
  ) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.productsImportService.import(user.businessId, file);
  }

  /** Column-mapping import, step 1 (UPD-FE-070) — parses the file and returns a real per-row
   * confidence preview against a real auto-suggested mapping; writes nothing. */
  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file'))
  importPreview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.productsImportService.parse(file);
  }

  /** Column-mapping import, step 2 — the caller's final mapping/corrections/skip-list, re-validated
   * server-side exactly like `parse()` did, then actually written. */
  @Post('import/commit')
  @UseInterceptors(FileInterceptor('file'))
  importCommit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CommitImportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.productsImportService.commit(
      user.businessId,
      file,
      JSON.parse(dto.mapping) as Record<string, string>,
      dto.skippedRows ? (JSON.parse(dto.skippedRows) as number[]) : [],
      dto.corrections
        ? (JSON.parse(dto.corrections) as {
            rowNumber: number;
            data: Record<string, string>;
          }[])
        : [],
    );
  }

  @Get()
  findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll({
      q: query.q,
      category: query.category,
      categoryId: query.categoryId,
      kind: query.kind,
      active: query.active === undefined ? undefined : query.active === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.productsService.deactivate(id);
  }
}
