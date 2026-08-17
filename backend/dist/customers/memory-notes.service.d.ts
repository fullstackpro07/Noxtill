import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateMemoryNoteDto } from './dto/create-memory-note.dto';
import { UpdateMemoryNoteDto } from './dto/update-memory-note.dto';
export declare class MemoryNotesService {
    private readonly tenantPrisma;
    private readonly cls;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService);
    create(dto: CreateMemoryNoteDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        body: string;
        subjectType: string;
        subjectId: string;
        pinned: boolean;
        authorUserId: string | null;
    }>;
    list(subjectType: string, subjectId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        body: string;
        subjectType: string;
        subjectId: string;
        pinned: boolean;
        authorUserId: string | null;
    }[]>;
    update(id: string, dto: UpdateMemoryNoteDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        body: string;
        subjectType: string;
        subjectId: string;
        pinned: boolean;
        authorUserId: string | null;
    }>;
    remove(id: string): Promise<void>;
    private findNote;
    private assertSubjectExists;
}
