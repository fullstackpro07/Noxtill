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
var AccountZipProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountZipProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const archiver_1 = require("archiver");
const stream_1 = require("stream");
const exports_service_1 = require("./exports.service");
const s3_service_1 = require("../common/storage/s3.service");
const notifications_service_1 = require("../notifications/notifications.service");
const exports_constants_1 = require("./exports.constants");
function buildZipBuffer(entries) {
    return new Promise((resolve, reject) => {
        const archive = new archiver_1.ZipArchive({ zlib: { level: 9 } });
        const chunks = [];
        const stream = new stream_1.PassThrough();
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
        archive.pipe(stream);
        for (const entry of entries) {
            archive.append(entry.buffer, { name: entry.name });
        }
        void archive.finalize();
    });
}
let AccountZipProcessor = AccountZipProcessor_1 = class AccountZipProcessor extends bullmq_1.WorkerHost {
    exportsService;
    s3;
    notifications;
    logger = new common_1.Logger(AccountZipProcessor_1.name);
    constructor(exportsService, s3, notifications) {
        super();
        this.exportsService = exportsService;
        this.s3 = s3;
        this.notifications = notifications;
    }
    async process(job) {
        const { businessId, userId } = job.data;
        const entries = await Promise.all(exports_constants_1.EXPORT_KINDS.map(async (kind) => ({
            name: `${kind}.xlsx`,
            buffer: await this.exportsService.buildXlsxBuffer(businessId, kind),
        })));
        const zip = await buildZipBuffer(entries);
        const key = `exports/${businessId}/account-${Date.now()}.zip`;
        const url = await this.s3.uploadAndSign(key, zip, 'application/zip');
        await this.notifications.create(businessId, userId, {
            title: 'Export ready',
            body: 'Your full account export is ready to download.',
            link: url,
        });
        this.logger.debug(`Account zip export ready for business ${businessId}`);
    }
};
exports.AccountZipProcessor = AccountZipProcessor;
exports.AccountZipProcessor = AccountZipProcessor = AccountZipProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(exports_constants_1.EXPORTS_QUEUE),
    __metadata("design:paramtypes", [exports_service_1.ExportsService,
        s3_service_1.S3Service,
        notifications_service_1.NotificationsService])
], AccountZipProcessor);
//# sourceMappingURL=account-zip.processor.js.map