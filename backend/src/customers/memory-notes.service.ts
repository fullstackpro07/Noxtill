import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { CreateMemoryNoteDto } from './dto/create-memory-note.dto';
import { UpdateMemoryNoteDto } from './dto/update-memory-note.dto';
import {
  MemoryNoteSubjectType,
  MEMORY_NOTE_ERROR_CODES,
} from './memory-notes.constants';
import { Prisma } from '../../generated/prisma';

/**
 * Business Memory notes (UPD-BE-026) — polymorphic, multi-row, timestamped notes attached to a
 * customer/supplier/product/table. `subjectType`/`subjectId` are opaque (no DB-level FK, same
 * convention as `ActivityEvent.entityType`/`entityId`); real-row existence is checked here at
 * write time instead.
 */
@Injectable()
export class MemoryNotesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
  ) {}

  async create(dto: CreateMemoryNoteDto) {
    await this.assertSubjectExists(dto.subjectType, dto.subjectId);
    const authorUserId = this.cls.get<string>(CLS_KEY_USER_ID);

    return this.tenantPrisma.client.memoryNote.create({
      data: {
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        body: dto.body,
        pinned: dto.pinned ?? false,
        authorUserId,
      } as Prisma.MemoryNoteUncheckedCreateInput,
    });
  }

  list(subjectType: string, subjectId: string) {
    return this.tenantPrisma.client.memoryNote.findMany({
      where: { subjectType, subjectId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async update(id: string, dto: UpdateMemoryNoteDto) {
    await this.findNote(id);
    return this.tenantPrisma.client.memoryNote.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findNote(id);
    await this.tenantPrisma.client.memoryNote.delete({ where: { id } });
  }

  private async findNote(id: string) {
    const note = await this.tenantPrisma.client.memoryNote.findUnique({
      where: { id },
    });
    if (!note) {
      throw new AppException(
        MEMORY_NOTE_ERROR_CODES.NOTE_NOT_FOUND,
        'Memory note not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return note;
  }

  private async assertSubjectExists(
    subjectType: MemoryNoteSubjectType,
    subjectId: string,
  ): Promise<void> {
    const exists = await (() => {
      switch (subjectType) {
        case 'customer':
          return this.tenantPrisma.client.customer.findUnique({
            where: { id: subjectId },
          });
        case 'supplier':
          return this.tenantPrisma.client.supplier.findUnique({
            where: { id: subjectId },
          });
        case 'product':
          return this.tenantPrisma.client.product.findUnique({
            where: { id: subjectId },
          });
        case 'table':
          return this.tenantPrisma.client.table.findUnique({
            where: { id: subjectId },
          });
      }
    })();
    if (!exists) {
      throw new NotFoundException(`No ${subjectType} found with that id`);
    }
  }
}
