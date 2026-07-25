import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Idempotent baseline categories/types (BE-069) so search and AI-mapping have something to match against. */
const CATEGORIES: {
  key: string;
  name: string;
  types: { key: string; label: string }[];
}[] = [
  {
    key: 'food_beverage',
    name: 'Food & Beverage',
    types: [
      { key: 'restaurant', label: 'Restaurant' },
      { key: 'cafe', label: 'Cafe' },
      { key: 'bakery', label: 'Bakery' },
      { key: 'food_truck', label: 'Food Truck' },
    ],
  },
  {
    key: 'retail',
    name: 'Retail',
    types: [
      { key: 'clothing_store', label: 'Clothing Store' },
      { key: 'grocery_store', label: 'Grocery Store' },
      { key: 'electronics_store', label: 'Electronics Store' },
    ],
  },
  {
    key: 'health_beauty',
    name: 'Health & Beauty',
    types: [
      { key: 'salon', label: 'Salon' },
      { key: 'spa', label: 'Spa' },
      { key: 'barbershop', label: 'Barbershop' },
      { key: 'clinic', label: 'Clinic' },
    ],
  },
  {
    key: 'services',
    name: 'Professional Services',
    types: [
      { key: 'repair_shop', label: 'Repair Shop' },
      { key: 'consultancy', label: 'Consultancy' },
      { key: 'cleaning_service', label: 'Cleaning Service' },
    ],
  },
  {
    key: 'other',
    name: 'Other',
    types: [{ key: 'other_business', label: 'Other Business' }],
  },
];

@Injectable()
export class BusinessTypesSeedService implements OnModuleInit {
  private readonly logger = new Logger(BusinessTypesSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      for (const category of CATEGORIES) {
        const cat = await this.prisma.businessCategory.upsert({
          where: { key: category.key },
          create: { key: category.key, name: category.name },
          update: { name: category.name },
        });
        for (const type of category.types) {
          await this.prisma.businessType.upsert({
            where: { key: type.key },
            create: { key: type.key, label: type.label, categoryId: cat.id },
            update: { label: type.label, categoryId: cat.id },
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to seed business types: ${(error as Error).message}`,
      );
    }
  }
}
