"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HelpModule = void 0;
const common_1 = require("@nestjs/common");
const help_articles_seed_service_1 = require("./help-articles-seed.service");
const help_service_1 = require("./help.service");
const help_controller_1 = require("./help.controller");
const ai_module_1 = require("../ai/ai.module");
let HelpModule = class HelpModule {
};
exports.HelpModule = HelpModule;
exports.HelpModule = HelpModule = __decorate([
    (0, common_1.Module)({
        imports: [ai_module_1.AiModule],
        controllers: [help_controller_1.HelpController],
        providers: [help_articles_seed_service_1.HelpArticlesSeedService, help_service_1.HelpService],
        exports: [help_service_1.HelpService],
    })
], HelpModule);
//# sourceMappingURL=help.module.js.map