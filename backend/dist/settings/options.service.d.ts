import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateOptionDto, CreateOptionSetDto, ReorderOptionsDto, UpdateOptionDto } from './dto/option-set.dto';
export declare class OptionsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    createSet(businessId: string, dto: CreateOptionSetDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        setKey: string;
        label: string;
    }>;
    listAll(): import("generated/prisma/runtime/library").PrismaPromise<({
        options: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            value: string;
            optionSetId: string;
            sortOrder: number;
            hidden: boolean;
        }[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        setKey: string;
        label: string;
    })[]>;
    addOption(setKey: string, dto: CreateOptionDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        value: string;
        optionSetId: string;
        sortOrder: number;
        hidden: boolean;
    }>;
    updateOption(setKey: string, optionId: string, dto: UpdateOptionDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        value: string;
        optionSetId: string;
        sortOrder: number;
        hidden: boolean;
    }>;
    removeOption(setKey: string, optionId: string): Promise<void>;
    reorder(setKey: string, dto: ReorderOptionsDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        value: string;
        optionSetId: string;
        sortOrder: number;
        hidden: boolean;
    }[]>;
    private findSet;
    private findOption;
}
