import { ClaudeClient } from '../ai/claude.client';
import { RawImportRow } from './customer-import.types';
export interface ImportFile {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
}
export declare class CustomerImportParser {
    private readonly claude;
    private readonly logger;
    constructor(claude: ClaudeClient);
    parse(file: ImportFile): Promise<RawImportRow[]>;
    private parseCsv;
    private parseXlsx;
    private toRawRow;
    private docxToText;
    private parseUnstructured;
    private stripCodeFences;
}
