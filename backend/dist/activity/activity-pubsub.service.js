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
var ActivityPubSubService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityPubSubService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rxjs_1 = require("rxjs");
const ioredis_1 = __importDefault(require("ioredis"));
let ActivityPubSubService = ActivityPubSubService_1 = class ActivityPubSubService {
    logger = new common_1.Logger(ActivityPubSubService_1.name);
    publisher;
    constructor(config) {
        this.publisher = new ioredis_1.default({
            host: config.get('REDIS_HOST', 'localhost'),
            port: Number(config.get('REDIS_PORT', 6379)),
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null,
        });
        this.publisher.on('error', (error) => this.logger.warn(`Activity pub/sub connection error: ${error.message}`));
    }
    async publish(channel, payload) {
        try {
            await this.publisher.publish(channel, JSON.stringify(payload));
        }
        catch (error) {
            this.logger.warn(`Failed to publish activity event on ${channel}: ${error.message}`);
        }
    }
    subscribe(channel) {
        return new rxjs_1.Observable((subscriber) => {
            const client = this.publisher.duplicate();
            client.on('error', (error) => this.logger.warn(`Activity subscriber error on ${channel}: ${error.message}`));
            client.on('message', (messageChannel, message) => {
                if (messageChannel !== channel)
                    return;
                try {
                    subscriber.next(JSON.parse(message));
                }
                catch (error) {
                    this.logger.warn(`Malformed activity event on ${channel}: ${error.message}`);
                }
            });
            client.subscribe(channel).catch((error) => {
                this.logger.warn(`Failed to subscribe to ${channel}: ${error.message}`);
            });
            return () => {
                client.unsubscribe(channel).catch(() => undefined);
                client.quit().catch(() => undefined);
            };
        });
    }
    onModuleDestroy() {
        this.publisher.disconnect();
    }
};
exports.ActivityPubSubService = ActivityPubSubService;
exports.ActivityPubSubService = ActivityPubSubService = ActivityPubSubService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ActivityPubSubService);
//# sourceMappingURL=activity-pubsub.service.js.map