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
var VoiceSaleService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceSaleService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const file_validation_util_1 = require("../common/utils/file-validation.util");
const speech_to_text_service_1 = require("../ai/speech-to-text.service");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const orders_service_1 = require("./orders.service");
const voice_sale_constants_1 = require("./voice-sale.constants");
let VoiceSaleService = VoiceSaleService_1 = class VoiceSaleService {
    tenantPrisma;
    speechToText;
    aiInfra;
    ordersService;
    logger = new common_1.Logger(VoiceSaleService_1.name);
    constructor(tenantPrisma, speechToText, aiInfra, ordersService) {
        this.tenantPrisma = tenantPrisma;
        this.speechToText = speechToText;
        this.aiInfra = aiInfra;
        this.ordersService = ordersService;
    }
    async parse(businessId, file) {
        await (0, file_validation_util_1.validateUploadedFile)(file, {
            allowedMimeTypes: voice_sale_constants_1.ALLOWED_VOICE_AUDIO_MIME_TYPES,
            maxSizeBytes: voice_sale_constants_1.MAX_VOICE_AUDIO_SIZE_BYTES,
        });
        const transcript = await this.speechToText.transcribe(file.buffer, file.mimetype, file.originalname);
        const parsed = await this.parseTranscript(businessId, transcript);
        const matchedItems = await this.matchProducts(businessId, parsed.items);
        const parsedCart = {
            items: matchedItems,
            customerName: parsed.customerName,
            paymentMethodGuess: parsed.paymentMethodGuess,
        };
        const draft = await this.tenantPrisma.client.voiceSaleDraft.create({
            data: {
                businessId,
                transcript,
                parsedCart: parsedCart,
            },
        });
        return { id: draft.id, transcript, ...parsedCart };
    }
    async confirm(businessId, id, dto) {
        const draft = await this.tenantPrisma.client.voiceSaleDraft.findUnique({
            where: { id },
        });
        if (!draft || draft.businessId !== businessId) {
            throw new common_1.NotFoundException('Voice sale draft not found');
        }
        const order = await this.ordersService.createSale(businessId, dto);
        await this.tenantPrisma.client.voiceSaleDraft.delete({ where: { id } });
        return order;
    }
    async parseTranscript(businessId, transcript) {
        const prompt = [
            'You extract a point-of-sale cart from a spoken transcript of a shop owner describing a sale.',
            `Transcript: "${transcript}"`,
            'Reply with ONLY a JSON object of this exact shape, no other text:',
            '{"items":[{"productName":"...","qty":1}],"customerName":null,"paymentMethodGuess":null}',
            'paymentMethodGuess must be one of "cash","card","online","credit", or null if unclear.',
            'Never invent items that were not mentioned. If nothing sellable was mentioned, return an empty items array.',
        ].join('\n');
        try {
            const raw = await this.aiInfra.complete(businessId, prompt);
            const jsonStart = raw.indexOf('{');
            const jsonEnd = raw.lastIndexOf('}');
            if (jsonStart === -1 || jsonEnd === -1)
                return { items: [], customerName: null, paymentMethodGuess: null };
            const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
            return {
                items: Array.isArray(parsed.items) ? parsed.items : [],
                customerName: parsed.customerName ?? null,
                paymentMethodGuess: parsed.paymentMethodGuess ?? null,
            };
        }
        catch (error) {
            this.logger.warn(`Voice sale transcript parsing failed: ${error.message}`);
            return { items: [], customerName: null, paymentMethodGuess: null };
        }
    }
    async matchProducts(businessId, items) {
        if (items.length === 0)
            return [];
        const products = await this.tenantPrisma.client.product.findMany({
            where: { businessId, active: true },
            select: { id: true, name: true },
        });
        return items.map((item) => {
            const lowerTarget = item.productName.toLowerCase();
            const match = products.find((p) => p.name.toLowerCase() === lowerTarget ||
                p.name.toLowerCase().includes(lowerTarget) ||
                lowerTarget.includes(p.name.toLowerCase()));
            return {
                productId: match?.id ?? null,
                name: item.productName,
                qty: item.qty > 0 ? item.qty : 1,
                matched: !!match,
            };
        });
    }
};
exports.VoiceSaleService = VoiceSaleService;
exports.VoiceSaleService = VoiceSaleService = VoiceSaleService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        speech_to_text_service_1.SpeechToTextService,
        ai_infra_service_1.AiInfraService,
        orders_service_1.OrdersService])
], VoiceSaleService);
//# sourceMappingURL=voice-sale.service.js.map