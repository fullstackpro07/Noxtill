"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfRendererService = void 0;
const common_1 = require("@nestjs/common");
const puppeteer_1 = __importDefault(require("puppeteer"));
let PdfRendererService = class PdfRendererService {
    async renderPdf(html) {
        const browser = await puppeteer_1.default.launch({
            headless: true,
            args: ['--no-sandbox'],
        });
        try {
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'load' });
            const pdf = await page.pdf({ format: 'A4' });
            return Buffer.from(pdf);
        }
        finally {
            await browser.close();
        }
    }
};
exports.PdfRendererService = PdfRendererService;
exports.PdfRendererService = PdfRendererService = __decorate([
    (0, common_1.Injectable)()
], PdfRendererService);
//# sourceMappingURL=pdf-renderer.service.js.map