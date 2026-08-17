import { OptionsService } from './options.service';
import { CreateOptionDto, CreateOptionSetDto, ReorderOptionsDto, UpdateOptionDto } from './dto/option-set.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class OptionsController {
    private readonly options;
    constructor(options: OptionsService);
    createSet(user: AuthenticatedUser, dto: CreateOptionSetDto): Promise<{
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
    updateOption(setKey: string, id: string, dto: UpdateOptionDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        value: string;
        optionSetId: string;
        sortOrder: number;
        hidden: boolean;
    }>;
    removeOption(setKey: string, id: string): Promise<void>;
    reorder(setKey: string, dto: ReorderOptionsDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        value: string;
        optionSetId: string;
        sortOrder: number;
        hidden: boolean;
    }[]>;
}
