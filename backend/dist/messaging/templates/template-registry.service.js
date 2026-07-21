"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateRegistryService = void 0;
const common_1 = require("@nestjs/common");
const template_registry_data_1 = require("./template-registry.data");
const DEFAULT_LOCALE = 'en';
let TemplateRegistryService = class TemplateRegistryService {
    get(templateKey) {
        return template_registry_data_1.TEMPLATE_REGISTRY[templateKey];
    }
    exists(templateKey, locale) {
        const def = this.get(templateKey);
        return !!def && !!(def.locales[locale] ?? def.locales[DEFAULT_LOCALE]);
    }
    render(templateKey, locale, variables) {
        const def = this.get(templateKey);
        if (!def) {
            throw new Error(`Unknown template key: ${templateKey}`);
        }
        const resolvedLocale = def.locales[locale] ? locale : DEFAULT_LOCALE;
        const body = def.locales[resolvedLocale];
        if (!body) {
            throw new Error(`No "${resolvedLocale}" (or "${DEFAULT_LOCALE}") copy for template: ${templateKey}`);
        }
        const text = body.replace(/\{\{(\w+)\}\}/g, (_match, name) => variables[name] ?? '');
        return { text, category: def.category, locale: resolvedLocale };
    }
};
exports.TemplateRegistryService = TemplateRegistryService;
exports.TemplateRegistryService = TemplateRegistryService = __decorate([
    (0, common_1.Injectable)()
], TemplateRegistryService);
//# sourceMappingURL=template-registry.service.js.map