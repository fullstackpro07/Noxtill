import { PrismaService } from '../prisma/prisma.service';
export interface LabelUpdate {
    area: string;
    key: string;
    value: string;
}
export declare class TerminologyService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getAll(businessId: string): Promise<Record<string, Record<string, string>>>;
    getArea(businessId: string, area: string): Promise<Record<string, string>>;
    setMany(businessId: string, updates: LabelUpdate[]): Promise<Record<string, Record<string, string>>>;
    applyToText(businessId: string, text: string): Promise<string>;
}
