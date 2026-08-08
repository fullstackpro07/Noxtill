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
exports.TokenCipherService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto_1 = require("crypto");
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
let TokenCipherService = class TokenCipherService {
    config;
    constructor(config) {
        this.config = config;
    }
    key() {
        const keyB64 = this.config.get('INTEGRATIONS_TOKEN_KEY');
        if (!keyB64) {
            throw new Error('INTEGRATIONS_TOKEN_KEY is not configured');
        }
        return Buffer.from(keyB64, 'base64');
    }
    encrypt(plaintext) {
        const iv = (0, crypto_1.randomBytes)(IV_LENGTH);
        const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, this.key(), iv);
        const ciphertext = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();
        return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
    }
    decrypt(stored) {
        const [ivB64, authTagB64, cipherB64] = stored.split(':');
        const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, this.key(), Buffer.from(ivB64, 'base64'));
        decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(cipherB64, 'base64')),
            decipher.final(),
        ]);
        return plaintext.toString('utf8');
    }
};
exports.TokenCipherService = TokenCipherService;
exports.TokenCipherService = TokenCipherService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TokenCipherService);
//# sourceMappingURL=token-cipher.service.js.map