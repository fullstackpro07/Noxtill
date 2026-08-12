import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { SpeechToTextService } from '../ai/speech-to-text.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { OrdersService } from './orders.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import {
  ALLOWED_VOICE_AUDIO_MIME_TYPES,
  MAX_VOICE_AUDIO_SIZE_BYTES,
} from './voice-sale.constants';
import { Prisma } from '../../generated/prisma';

export interface ParsedVoiceItem {
  productName: string;
  qty: number;
}

export interface ParsedVoiceCart {
  items: ParsedVoiceItem[];
  customerName: string | null;
  paymentMethodGuess: 'cash' | 'card' | 'online' | 'credit' | null;
}

export interface MatchedVoiceItem {
  productId: string | null;
  name: string;
  qty: number;
  matched: boolean;
}

/**
 * Voice-entry Sale (UPD-BE-008). Never writes a sale directly from the AI's guess — this is the
 * same "AI never writes a money record without explicit confirmation" rule already established
 * for import-by-photo. `parse()` only ever produces a staged, editable draft; `confirm()` requires
 * the caller to hand back a real, final `CreateSaleDto` (possibly hand-corrected), which goes
 * through `OrdersService.createSale()`'s own full validation exactly like any other sale.
 */
@Injectable()
export class VoiceSaleService {
  private readonly logger = new Logger(VoiceSaleService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly speechToText: SpeechToTextService,
    private readonly aiInfra: AiInfraService,
    private readonly ordersService: OrdersService,
  ) {}

  async parse(
    businessId: string,
    file: {
      buffer: Buffer;
      size: number;
      mimetype: string;
      originalname: string;
    },
  ) {
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_VOICE_AUDIO_MIME_TYPES,
      maxSizeBytes: MAX_VOICE_AUDIO_SIZE_BYTES,
    });

    const transcript = await this.speechToText.transcribe(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    const parsed = await this.parseTranscript(businessId, transcript);
    const matchedItems = await this.matchProducts(businessId, parsed.items);

    const parsedCart = {
      items: matchedItems,
      customerName: parsed.customerName,
      paymentMethodGuess: parsed.paymentMethodGuess,
    };

    const draft = await this.tenantPrisma.client.voiceSaleDraft.create({
      data: {
        businessId,
        transcript,
        parsedCart: parsedCart as unknown as Prisma.InputJsonValue,
      },
    });

    return { id: draft.id, transcript, ...parsedCart };
  }

  async confirm(businessId: string, id: string, dto: CreateSaleDto) {
    const draft = await this.tenantPrisma.client.voiceSaleDraft.findUnique({
      where: { id },
    });
    if (!draft || draft.businessId !== businessId) {
      throw new NotFoundException('Voice sale draft not found');
    }

    const order = await this.ordersService.createSale(businessId, dto);
    await this.tenantPrisma.client.voiceSaleDraft.delete({ where: { id } });
    return order;
  }

  private async parseTranscript(
    businessId: string,
    transcript: string,
  ): Promise<ParsedVoiceCart> {
    const prompt = [
      'You extract a point-of-sale cart from a spoken transcript of a shop owner describing a sale.',
      `Transcript: "${transcript}"`,
      'Reply with ONLY a JSON object of this exact shape, no other text:',
      '{"items":[{"productName":"...","qty":1}],"customerName":null,"paymentMethodGuess":null}',
      'paymentMethodGuess must be one of "cash","card","online","credit", or null if unclear.',
      'Never invent items that were not mentioned. If nothing sellable was mentioned, return an empty items array.',
    ].join('\n');

    try {
      const raw = await this.aiInfra.complete(businessId, prompt);
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1)
        return { items: [], customerName: null, paymentMethodGuess: null };

      const parsed = JSON.parse(
        raw.slice(jsonStart, jsonEnd + 1),
      ) as Partial<ParsedVoiceCart>;
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        customerName: parsed.customerName ?? null,
        paymentMethodGuess: parsed.paymentMethodGuess ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `Voice sale transcript parsing failed: ${(error as Error).message}`,
      );
      return { items: [], customerName: null, paymentMethodGuess: null };
    }
  }

  private async matchProducts(
    businessId: string,
    items: ParsedVoiceItem[],
  ): Promise<MatchedVoiceItem[]> {
    if (items.length === 0) return [];

    const products = await this.tenantPrisma.client.product.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true },
    });

    return items.map((item) => {
      const lowerTarget = item.productName.toLowerCase();
      const match = products.find(
        (p) =>
          p.name.toLowerCase() === lowerTarget ||
          p.name.toLowerCase().includes(lowerTarget) ||
          lowerTarget.includes(p.name.toLowerCase()),
      );
      return {
        productId: match?.id ?? null,
        name: item.productName,
        qty: item.qty > 0 ? item.qty : 1,
        matched: !!match,
      };
    });
  }
}
