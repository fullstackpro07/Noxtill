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
exports.S3Service = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;
let S3Service = class S3Service {
    config;
    client;
    bucket;
    constructor(config) {
        this.config = config;
        this.bucket = this.config.get('S3_BUCKET', 'noxtill-dev');
        this.client = new client_s3_1.S3Client({
            region: this.config.get('S3_REGION', 'us-east-1'),
            endpoint: this.config.get('S3_ENDPOINT') || undefined,
            forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE') === 'true',
            credentials: this.config.get('S3_ACCESS_KEY_ID') &&
                this.config.get('S3_SECRET_ACCESS_KEY')
                ? {
                    accessKeyId: this.config.get('S3_ACCESS_KEY_ID'),
                    secretAccessKey: this.config.get('S3_SECRET_ACCESS_KEY'),
                }
                : undefined,
        });
    }
    async upload(key, body, contentType) {
        await this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
        }));
    }
    async getSignedDownloadUrl(key, expiresInSeconds = SIGNED_URL_TTL_SECONDS) {
        const command = new client_s3_1.GetObjectCommand({ Bucket: this.bucket, Key: key });
        return (0, s3_request_presigner_1.getSignedUrl)(this.client, command, { expiresIn: expiresInSeconds });
    }
    async uploadAndSign(key, body, contentType) {
        await this.upload(key, body, contentType);
        return this.getSignedDownloadUrl(key);
    }
};
exports.S3Service = S3Service;
exports.S3Service = S3Service = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], S3Service);
//# sourceMappingURL=s3.service.js.map