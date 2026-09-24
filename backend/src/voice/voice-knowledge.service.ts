import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { MAX_KNOWLEDGE_ENTRIES } from './voice.constants';
import {
  CreateKnowledgeEntryDto,
  UpdateKnowledgeEntryDto,
} from './dto/knowledge-entry.dto';

/**
 * AI Phone, full — real FAQ/document knowledge sources the receptionist may draw on (Knowledge
 * screen's "Import document"/entries). CRUD only, tenant-scoped; the actual per-call lookup lives
 * in `VoiceCallService.findKnowledge` since it runs off the unauthenticated Twilio webhook with no
 * CLS tenant bound, same reasoning as `VoiceRoutingRulesService`.
 */
@Injectable()
export class VoiceKnowledgeService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list() {
    return this.tenantPrisma.client.voiceKnowledgeEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(businessId: string, dto: CreateKnowledgeEntryDto) {
    const count = await this.tenantPrisma.client.voiceKnowledgeEntry.count();
    if (count >= MAX_KNOWLEDGE_ENTRIES) {
      throw new AppException(
        'VOICE_KNOWLEDGE_LIMIT',
        `You can keep at most ${MAX_KNOWLEDGE_ENTRIES} knowledge entries`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.tenantPrisma.client.voiceKnowledgeEntry.create({
      data: {
        businessId,
        kind: dto.kind,
        title: dto.title,
        question: dto.kind === 'faq' ? (dto.question ?? null) : null,
        content: dto.content,
        sourceFilename: dto.sourceFilename ?? null,
      },
    });
  }

  async update(businessId: string, id: string, dto: UpdateKnowledgeEntryDto) {
    await this.findOwned(businessId, id);
    return this.tenantPrisma.client.voiceKnowledgeEntry.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.question !== undefined ? { question: dto.question } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async remove(businessId: string, id: string) {
    await this.findOwned(businessId, id);
    await this.tenantPrisma.client.voiceKnowledgeEntry.delete({
      where: { id },
    });
    return { id };
  }

  private async findOwned(businessId: string, id: string) {
    const row = await this.tenantPrisma.client.voiceKnowledgeEntry.findUnique({
      where: { id },
    });
    if (!row || row.businessId !== businessId) {
      throw new NotFoundException('Knowledge entry not found');
    }
    return row;
  }
}
