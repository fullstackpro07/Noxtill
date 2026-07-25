"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformAdminModule = void 0;
const common_1 = require("@nestjs/common");
const events_service_1 = require("./events.service");
const admin_service_1 = require("./admin.service");
const events_controller_1 = require("./events.controller");
const admin_controller_1 = require("./admin.controller");
const platform_admin_guard_1 = require("./platform-admin.guard");
let PlatformAdminModule = class PlatformAdminModule {
};
exports.PlatformAdminModule = PlatformAdminModule;
exports.PlatformAdminModule = PlatformAdminModule = __decorate([
    (0, common_1.Module)({
        controllers: [events_controller_1.EventsController, admin_controller_1.AdminController],
        providers: [events_service_1.EventsService, admin_service_1.AdminService, platform_admin_guard_1.PlatformAdminGuard],
    })
], PlatformAdminModule);
//# sourceMappingURL=platform-admin.module.js.map