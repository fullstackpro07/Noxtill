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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmbConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const google_oauth2_connector_1 = require("./google-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
let GmbConnector = class GmbConnector extends google_oauth2_connector_1.GoogleOAuth2Connector {
    provider = prisma_1.IntegrationProvider.gmb;
    scope = 'https://www.googleapis.com/auth/business.manage';
    constructor(config) {
        super(config);
    }
    async sync(tokens) {
        const response = await axios_1.default.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return response.data;
    }
};
exports.GmbConnector = GmbConnector;
exports.GmbConnector = GmbConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GmbConnector);
//# sourceMappingURL=gmb.connector.js.map