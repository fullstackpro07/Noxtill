"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BusinessTypesSeedService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BusinessTypesSeedService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const CATEGORIES = [
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
let BusinessTypesSeedService = BusinessTypesSeedService_1 = class BusinessTypesSeedService {
    prisma;
    logger = new common_1.Logger(BusinessTypesSeedService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
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
        }
        catch (error) {
            this.logger.error(`Failed to seed business types: ${error.message}`);
        }
    }
};
exports.BusinessTypesSeedService = BusinessTypesSeedService;
exports.BusinessTypesSeedService = BusinessTypesSeedService = BusinessTypesSeedService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BusinessTypesSeedService);
//# sourceMappingURL=business-types-seed.service.js.map