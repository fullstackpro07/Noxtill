import { MemoryNotesService } from './memory-notes.service';
import { CreateMemoryNoteDto } from './dto/create-memory-note.dto';
import { UpdateMemoryNoteDto } from './dto/update-memory-note.dto';
export declare class MemoryNotesController {
    private readonly memoryNotesService;
    constructor(memoryNotesService: MemoryNotesService);
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
}
