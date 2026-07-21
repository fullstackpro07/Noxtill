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
exports.dlqName = exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const queue_constants_1 = require("./queue.constants");
Object.defineProperty(exports, "dlqName", { enumerable: true, get: function () { return queue_constants_1.dlqName; } });
let QueueService = class QueueService {
    demoQueue;
    constructor(demoQueue) {
        this.demoQueue = demoQueue;
    }
    async addJob(queue, jobName, data, idempotencyKey, opts = {}) {
        return queue.add(jobName, data, {
            ...queue_constants_1.DEFAULT_JOB_OPTIONS,
            ...opts,
            jobId: idempotencyKey,
        });
    }
    async addDemoJob(jobName, data, idempotencyKey) {
        return this.addJob(this.demoQueue, jobName, data, idempotencyKey);
    }
    get demo() {
        return this.demoQueue;
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(queue_constants_1.DEMO_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], QueueService);
//# sourceMappingURL=queue.service.js.map