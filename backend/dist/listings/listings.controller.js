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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListingsController = void 0;
const common_1 = require("@nestjs/common");
const master_listing_service_1 = require("./master-listing.service");
const listing_sync_service_1 = require("./listing-sync.service");
const gmb_management_service_1 = require("./gmb-management.service");
const update_master_listing_dto_1 = require("./dto/update-master-listing.dto");
const gmb_dto_1 = require("./dto/gmb.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let ListingsController = class ListingsController {
    masterListing;
    listingSync;
    gmbManagement;
    constructor(masterListing, listingSync, gmbManagement) {
        this.masterListing = masterListing;
        this.listingSync = listingSync;
        this.gmbManagement = gmbManagement;
    }
    getMaster(user) {
        return this.masterListing.get(user.businessId);
    }
    updateMaster(user, dto) {
        return this.masterListing.update(user.businessId, dto);
    }
    sync(user) {
        return this.listingSync.sync(user.businessId);
    }
    syncLog(user) {
        return this.listingSync.listSyncLog(user.businessId);
    }
    health(user) {
        return this.listingSync.health(user.businessId);
    }
    citations(user) {
        return this.listingSync.citationAudit(user.businessId);
    }
    listGmbAccounts(user) {
        return this.gmbManagement.listAccounts(user.businessId);
    }
    listGmbLocations(user, accountName) {
        return this.gmbManagement.listLocations(user.businessId, accountName);
    }
    selectGmbLocation(user, dto) {
        return this.gmbManagement.selectLocation(user.businessId, dto.locationId);
    }
    listPosts(user) {
        return this.gmbManagement.listPosts(user.businessId);
    }
    createPost(user, dto) {
        return this.gmbManagement.createPost(user.businessId, dto);
    }
    publishPost(user, id) {
        return this.gmbManagement.publishPost(user.businessId, id);
    }
    deletePost(user, id) {
        return this.gmbManagement.deletePost(user.businessId, id);
    }
    listPhotos(user) {
        return this.gmbManagement.listPhotos(user.businessId);
    }
    addPhoto(user, dto) {
        return this.gmbManagement.addPhoto(user.businessId, dto);
    }
    removePhoto(user, id) {
        return this.gmbManagement.removePhoto(user.businessId, id);
    }
    listQna(user) {
        return this.gmbManagement.listQna(user.businessId);
    }
    syncQna(user) {
        return this.gmbManagement.syncQuestions(user.businessId);
    }
    answerQna(user, id, dto) {
        return this.gmbManagement.answerQuestion(user.businessId, id, dto.answer);
    }
    listInsights(user) {
        return this.gmbManagement.listInsights(user.businessId);
    }
    pullInsights(user) {
        return this.gmbManagement.pullInsights(user.businessId);
    }
};
exports.ListingsController = ListingsController;
__decorate([
    (0, common_1.Get)('listings/master'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "getMaster", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Patch)('listings/master'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_master_listing_dto_1.UpdateMasterListingDto]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "updateMaster", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Post)('listings/sync'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "sync", null);
__decorate([
    (0, common_1.Get)('listings/sync-log'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "syncLog", null);
__decorate([
    (0, common_1.Get)('listings/health'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('seo/citations'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "citations", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Get)('listings/gmb/accounts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "listGmbAccounts", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Get)('listings/gmb/locations'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('accountName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "listGmbLocations", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Post)('listings/gmb/location'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, gmb_dto_1.SelectGmbLocationDto]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "selectGmbLocation", null);
__decorate([
    (0, common_1.Get)('listings/gmb/posts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "listPosts", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Post)('listings/gmb/posts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, gmb_dto_1.CreateGmbPostDto]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "createPost", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Post)('listings/gmb/posts/:id/publish'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "publishPost", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Delete)('listings/gmb/posts/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "deletePost", null);
__decorate([
    (0, common_1.Get)('listings/gmb/photos'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "listPhotos", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Post)('listings/gmb/photos'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, gmb_dto_1.CreateGmbPhotoDto]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "addPhoto", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Delete)('listings/gmb/photos/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "removePhoto", null);
__decorate([
    (0, common_1.Get)('listings/gmb/qna'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "listQna", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Post)('listings/gmb/qna/sync'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "syncQna", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Patch)('listings/gmb/qna/:id/answer'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, gmb_dto_1.AnswerGmbQnaDto]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "answerQna", null);
__decorate([
    (0, common_1.Get)('listings/gmb/insights'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "listInsights", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.LISTINGS_MANAGE),
    (0, common_1.Post)('listings/gmb/insights/pull'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ListingsController.prototype, "pullInsights", null);
exports.ListingsController = ListingsController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [master_listing_service_1.MasterListingService,
        listing_sync_service_1.ListingSyncService,
        gmb_management_service_1.GmbManagementService])
], ListingsController);
//# sourceMappingURL=listings.controller.js.map