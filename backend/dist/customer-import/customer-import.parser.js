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
var CustomerImportParser_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerImportParser = void 0;
const common_1 = require("@nestjs/common");
const sync_1 = require("csv-parse/sync");
const exceljs_1 = require("exceljs");
const mammoth_1 = require("mammoth");
const claude_client_1 = require("../ai/claude.client");
const CLAUDE_CHUNK_SIZE = 6000;
let CustomerImportParser = CustomerImportParser_1 = class CustomerImportParser {
    claude;
    logger = new common_1.Logger(CustomerImportParser_1.name);
    constructor(claude) {
        this.claude = claude;
    }
    async parse(file) {
        const isXlsx = file.mimetype.includes('sheet') ||
            file.originalname.toLowerCase().endsWith('.xlsx');
        const isDocx = file.mimetype.includes('wordprocessingml') ||
            file.originalname.toLowerCase().endsWith('.docx');
        const isCsv = file.mimetype.includes('csv') ||
            file.originalname.toLowerCase().endsWith('.csv');
        if (isXlsx)
            return this.parseXlsx(file.buffer);
        if (isCsv)
            return this.parseCsv(file.buffer);
        if (isDocx)
            return this.parseUnstructured(await this.docxToText(file.buffer));
        return this.parseUnstructured(file.buffer.toString('utf-8'));
    }
    parseCsv(buffer) {
        const records = (0, sync_1.parse)(buffer.toString('utf-8'), {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
        return records.map((row) => this.toRawRow(row));
    }
    async parseXlsx(buffer) {
        const workbook = new exceljs_1.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];
        const [headerRow, ...dataRows] = sheet.getRows(1, sheet.rowCount) ?? [];
        if (!headerRow)
            return [];
        const headers = headerRow.values
            .slice(1)
            .map((h) => String(h ?? '').trim());
        return dataRows.map((row) => {
            const values = row.values.slice(1);
            const record = Object.fromEntries(headers.map((header, i) => [header, String(values[i] ?? '').trim()]));
            return this.toRawRow(record);
        });
    }
    toRawRow(row) {
        const balanceRaw = row.balance ?? row.openingBalance ?? row.opening_balance;
        const balance = balanceRaw ? Number(balanceRaw) : undefined;
        return {
            name: (row.name ?? '').trim(),
            phone: (row.phone ?? '').trim(),
            balance: balance && !Number.isNaN(balance) ? balance : undefined,
        };
    }
    async docxToText(buffer) {
        const result = await (0, mammoth_1.extractRawText)({ buffer });
        return result.value;
    }
    async parseUnstructured(text) {
        const chunks = [];
        for (let i = 0; i < text.length; i += CLAUDE_CHUNK_SIZE) {
            chunks.push(text.slice(i, i + CLAUDE_CHUNK_SIZE));
        }
        const rows = [];
        for (const chunk of chunks) {
            if (!chunk.trim())
                continue;
            const prompt = [
                'Extract customer contact records from the text below.',
                'Return ONLY a JSON array (no markdown fences, no prose) of objects shaped like:',
                '{"name": string, "phone": string, "balance": number | null}',
                '"balance" is an opening credit balance if mentioned, otherwise null. Skip lines with no name or phone.',
                '---',
                chunk,
            ].join('\n');
            try {
                const response = await this.claude.complete(prompt, 0);
                const parsed = JSON.parse(this.stripCodeFences(response));
                for (const row of parsed) {
                    if (row.name && row.phone) {
                        rows.push({
                            name: row.name,
                            phone: row.phone,
                            balance: row.balance ?? undefined,
                        });
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Claude extraction chunk failed: ${error.message}`);
            }
        }
        return rows;
    }
    stripCodeFences(text) {
        return text
            .trim()
            .replace(/^```(json)?/i, '')
            .replace(/```$/, '')
            .trim();
    }
};
exports.CustomerImportParser = CustomerImportParser;
exports.CustomerImportParser = CustomerImportParser = CustomerImportParser_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [claude_client_1.ClaudeClient])
], CustomerImportParser);
//# sourceMappingURL=customer-import.parser.js.map