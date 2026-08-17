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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MasterListingService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
let MasterListingService = class MasterListingService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async get(businessId) {
        const existing = await this.tenantPrisma.client.masterListing.findUnique({
            where: { businessId },
        });
        return existing ?? this.emptyView(businessId);
    }
    async update(businessId, dto) {
        return this.tenantPrisma.client.masterListing.upsert({
            where: { businessId },
            create: { businessId, ...dto },
            update: { ...dto },
        });
    }
    async find(businessId) {
        return this.tenantPrisma.client.masterListing.findUnique({
            where: { businessId },
        });
    }
    toConnectorData(listing) {
        return {
            name: listing.name,
            phone: listing.phone,
            website: listing.website,
            addressLine1: listing.addressLine1,
            addressLine2: listing.addressLine2,
            city: listing.city,
            state: listing.state,
            postalCode: listing.postalCode,
            country: listing.country,
            categories: listing.categories,
            description: listing.description,
            hours: listing.hours,
        };
    }
    emptyView(businessId) {
        return {
            id: null,
            businessId,
            name: '',
            phone: null,
            website: null,
            addressLine1: null,
            addressLine2: null,
            city: null,
            state: null,
            postalCode: null,
            country: null,
            categories: [],
            description: null,
            hours: {},
            logoUrl: null,
            createdAt: null,
            updatedAt: null,
        };
    }
};
exports.MasterListingService = MasterListingService;
exports.MasterListingService = MasterListingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], MasterListingService);
//# sourceMappingURL=master-listing.service.js.map