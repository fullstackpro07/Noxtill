import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { VariantsService } from './variants.service';
import { BundlesService } from './bundles.service';
import { SuppliersService } from './suppliers.service';
import { PricingService } from './pricing.service';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { VariantsController } from './variants.controller';
import { BundlesController } from './bundles.controller';
import { SuppliersController } from './suppliers.controller';
import { PricingController } from './pricing.controller';
import { CategoriesController } from './categories.controller';
import { ActivityModule } from '../activity/activity.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [ActivityModule, AiModule],
  // BundlesController (`/products/bundle`) and PricingController (`/products/bulk-price`) are
  // registered BEFORE ProductsController on purpose: Express/Nest resolve routes in registration
  // order, and ProductsController's `:id` params (`GET/PATCH /products/:id`) would otherwise
  // swallow these literal paths first (e.g. `bulk-price` matching as `:id`).
  controllers: [
    BundlesController,
    PricingController,
    VariantsController,
    SuppliersController,
    ProductsController,
    CategoriesController,
  ],
  providers: [
    ProductsService,
    ProductsImportService,
    VariantsService,
    BundlesService,
    SuppliersService,
    PricingService,
    CategoriesService,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
