import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { validateUploadedFile } from '../../common/utils/file-validation.util';
import { SpeechToTextService } from '../../ai/speech-to-text.service';
import { AiInfraService } from '../../ai/ai-infra.service';
import { AppException } from '../../common/filters/app.exception';
import { InventoryService } from '../../inventory/inventory.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { CustomersService } from '../../customers/customers.service';
import { CashRegisterService } from '../../cash-register/cash-register.service';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import {
  ALLOWED_VOICE_COMMAND_AUDIO_MIME_TYPES,
  MAX_VOICE_COMMAND_AUDIO_SIZE_BYTES,
  VOICE_COMMAND_ACTIONS,
  VOICE_COMMAND_ERROR_CODES,
  VoiceCommandAction,
} from './voice-command.constants';
import { Prisma, VoiceCommandStatus } from '@prisma/client';

const WASTAGE_REASONS = ['Expired', 'Damaged', 'Theft', 'Other'] as const;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

interface ParsedCommand {
  action: VoiceCommandAction | 'unrecognized';
  args: Record<string, unknown>;
}

/**
 * Voice Assistant, general-purpose (UPD-BE-113). Follows the same "AI never writes without
 * explicit confirmation" staged-draft discipline as `VoiceSaleService` — `propose()` only ever
 * produces a `VoiceCommandDraft`; `confirm()` performs the real write through the exact same
 * service any other caller of that action would go through, so it inherits that action's own
 * validation and (for `add_expense`) capability check.
 */
@Injectable()
export class VoiceCommandService {
  private readonly logger = new Logger(VoiceCommandService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly speechToText: SpeechToTextService,
    private readonly aiInfra: AiInfraService,
    private readonly inventoryService: InventoryService,
    private readonly expensesService: ExpensesService,
    private readonly customersService: CustomersService,
    private readonly cashRegisterService: CashRegisterService,
  ) {}

  async propose(
    businessId: string,
    userId: string,
    file: {
      buffer: Buffer;
      size: number;
      mimetype: string;
      originalname: string;
    },
  ) {
    await validateUploadedFile(file, {
      allowedMimeTypes: ALLOWED_VOICE_COMMAND_AUDIO_MIME_TYPES,
      maxSizeBytes: MAX_VOICE_COMMAND_AUDIO_SIZE_BYTES,
    });

    const transcript = await this.speechToText.transcribe(
      file.buffer,
      file.mimetype,
      file.originalname,
    );

    const parsed = await this.parseCommand(businessId, transcript);

    if (parsed.action === 'unrecognized') {
      throw new AppException(
        VOICE_COMMAND_ERROR_CODES.UNRECOGNIZED,
        "Couldn't match that to a supported action — try record wastage, add an expense, add a customer, or a cash-drawer movement.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const { args, humanSummary } = await this.resolveArgs(
      businessId,
      parsed.action,
      parsed.args,
    );

    const draft = await this.tenantPrisma.client.voiceCommandDraft.create({
      data: {
        businessId,
        createdByUserId: userId,
        transcript,
        action: parsed.action,
        args: args as Prisma.InputJsonValue,
        humanSummary,
      },
    });

    return {
      id: draft.id,
      transcript,
      action: parsed.action,
      args,
      humanSummary,
    };
  }

  async confirm(
    user: AuthenticatedUser,
    id: string,
    argsOverride?: Record<string, unknown>,
  ) {
    const draft = await this.tenantPrisma.client.voiceCommandDraft.findUnique({
      where: { id },
    });
    if (!draft || draft.businessId !== user.businessId) {
      throw new NotFoundException('Voice command not found');
    }
    if (draft.status !== VoiceCommandStatus.pending) {
      throw new AppException(
        VOICE_COMMAND_ERROR_CODES.ALREADY_RESOLVED,
        `This command was already ${draft.status}.`,
        HttpStatus.CONFLICT,
      );
    }

    const args = {
      ...(draft.args as Record<string, unknown>),
      ...argsOverride,
    };
    const action = draft.action as VoiceCommandAction;

    if (
      action === 'add_expense' &&
      !user.capabilities.includes(CAPABILITIES.EXPENSES_MANAGE)
    ) {
      throw new ForbiddenException('Ask the owner for access');
    }
    if (action === 'record_wastage' && !args.productId) {
      throw new AppException(
        VOICE_COMMAND_ERROR_CODES.PRODUCT_NOT_MATCHED,
        'No matching product was set on this command — pass `argsOverride.productId` (pick the right product) before confirming.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.execute(user.businessId, action, args);

    await this.tenantPrisma.client.voiceCommandDraft.update({
      where: { id },
      data: { status: VoiceCommandStatus.confirmed, confirmedAt: new Date() },
    });

    return result;
  }

  async cancel(businessId: string, id: string) {
    const draft = await this.tenantPrisma.client.voiceCommandDraft.findUnique({
      where: { id },
    });
    if (!draft || draft.businessId !== businessId) {
      throw new NotFoundException('Voice command not found');
    }
    if (draft.status !== VoiceCommandStatus.pending) {
      throw new AppException(
        VOICE_COMMAND_ERROR_CODES.ALREADY_RESOLVED,
        `This command was already ${draft.status}.`,
        HttpStatus.CONFLICT,
      );
    }
    return this.tenantPrisma.client.voiceCommandDraft.update({
      where: { id },
      data: { status: VoiceCommandStatus.rejected },
    });
  }

  private async execute(
    businessId: string,
    action: VoiceCommandAction,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (action) {
      case 'record_wastage':
        return this.inventoryService.recordWastage(businessId, {
          productId: args.productId as string,
          qty: args.qty as number,
          reason: args.reason as (typeof WASTAGE_REASONS)[number],
          note: args.note as string | undefined,
        });
      case 'add_expense':
        return this.expensesService.create({
          description: args.description as string,
          category: args.category as string,
          amount: args.amount as number,
          incurredOn: new Date().toISOString(),
        });
      case 'add_customer':
        return this.customersService.create(businessId, {
          name: args.name as string,
          phone: args.phone as string,
        });
      case 'record_cash_movement':
        return this.cashRegisterService.recordMovement(businessId, {
          type: args.type as 'cash_in' | 'cash_out',
          amount: args.amount as number,
          note: args.note as string | undefined,
        });
    }
  }

  /** Fills in anything `execute()` needs beyond what the model returned (a matched `productId`, a normalized reason) and builds a deterministic, non-AI-generated confirmation summary. */
  private async resolveArgs(
    businessId: string,
    action: VoiceCommandAction,
    rawArgs: Record<string, unknown>,
  ): Promise<{ args: Record<string, unknown>; humanSummary: string }> {
    switch (action) {
      case 'record_wastage': {
        const productName = asString(rawArgs.productName);
        const qty = Math.max(1, Math.round(Number(rawArgs.qty) || 1));
        const reason = WASTAGE_REASONS.includes(
          rawArgs.reason as (typeof WASTAGE_REASONS)[number],
        )
          ? (rawArgs.reason as (typeof WASTAGE_REASONS)[number])
          : 'Other';
        const note = rawArgs.note ? asString(rawArgs.note) : undefined;

        const products = await this.tenantPrisma.client.product.findMany({
          where: { businessId, active: true },
          select: { id: true, name: true },
        });
        const lowerTarget = productName.toLowerCase();
        const match = products.find(
          (p) =>
            p.name.toLowerCase() === lowerTarget ||
            p.name.toLowerCase().includes(lowerTarget) ||
            lowerTarget.includes(p.name.toLowerCase()),
        );

        return {
          args: {
            productName,
            productId: match?.id ?? null,
            matched: !!match,
            qty,
            reason,
            note,
          },
          humanSummary: match
            ? `Write off ${qty} × ${match.name} as ${reason}${note ? ` — "${note}"` : ''}`
            : `Couldn't match "${productName}" to a real product — pick one manually before confirming`,
        };
      }
      case 'add_expense': {
        const description = asString(rawArgs.description, 'Expense');
        const category = asString(rawArgs.category, 'Other');
        const amount = Math.max(0.01, Number(rawArgs.amount) || 0);
        return {
          args: { description, category, amount },
          humanSummary: `Log a "${category}" expense of ${amount} — ${description}`,
        };
      }
      case 'add_customer': {
        const name = asString(rawArgs.name);
        const phone = asString(rawArgs.phone);
        return {
          args: { name, phone },
          humanSummary: `Add customer ${name}${phone ? ` (${phone})` : ''}`,
        };
      }
      case 'record_cash_movement': {
        const type = rawArgs.type === 'cash_out' ? 'cash_out' : 'cash_in';
        const amount = Math.max(0.01, Number(rawArgs.amount) || 0);
        const note = rawArgs.note ? asString(rawArgs.note) : undefined;
        return {
          args: { type, amount, note },
          humanSummary: `${type === 'cash_in' ? 'Add' : 'Remove'} ${amount} ${type === 'cash_in' ? 'to' : 'from'} the cash drawer${note ? ` — "${note}"` : ''}`,
        };
      }
    }
  }

  private async parseCommand(
    businessId: string,
    transcript: string,
  ): Promise<ParsedCommand> {
    const prompt = [
      'You extract a single hands-free voice command for a small business app from a spoken transcript.',
      `Transcript: "${transcript}"`,
      `Supported actions (choose exactly one, or "unrecognized" if nothing clearly matches):`,
      '- record_wastage: {"productName": string, "qty": number, "reason": "Expired"|"Damaged"|"Theft"|"Other", "note": string|null}',
      '- add_expense: {"description": string, "category": string, "amount": number}',
      '- add_customer: {"name": string, "phone": string}',
      '- record_cash_movement: {"type": "cash_in"|"cash_out", "amount": number, "note": string|null}',
      'Reply with ONLY a JSON object of this exact shape, no other text: {"action":"...","args":{...}}',
      'Never invent a value that was not mentioned or clearly implied by the transcript.',
    ].join('\n');

    try {
      const raw = await this.aiInfra.complete(
        businessId,
        prompt,
        0,
        'voice_entry',
      );
      const jsonStart = raw.indexOf('{');
      const jsonEnd = raw.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        return { action: 'unrecognized', args: {} };
      }
      const parsed = JSON.parse(
        raw.slice(jsonStart, jsonEnd + 1),
      ) as Partial<ParsedCommand>;
      const action = parsed.action;
      if (
        !action ||
        !VOICE_COMMAND_ACTIONS.includes(action as VoiceCommandAction)
      ) {
        return { action: 'unrecognized', args: {} };
      }
      return { action, args: parsed.args ?? {} };
    } catch (error) {
      this.logger.warn(
        `Voice command parsing failed: ${(error as Error).message}`,
      );
      return { action: 'unrecognized', args: {} };
    }
  }
}
