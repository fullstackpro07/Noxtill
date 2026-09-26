import { HttpStatus, Injectable } from '@nestjs/common';
import { InboxSettings, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { ASSIGN_MODES, LANGUAGES, TONES } from './inbox.constants';
import { hasHours, parseWeeklyHours, WeeklyHours } from './inbox-hours.util';
import { UpdateInboxSettingsDto } from './dto/inbox.dto';

export type ResolvedInboxSettings = Omit<
  InboxSettings,
  'id' | 'createdAt' | 'updatedAt' | 'workingHours'
> & {
  /** The hours actually in force: the inbox's own, else the business's. */
  hours: WeeklyHours;
  hoursSource: 'inbox' | 'business' | 'none';
  timezone: string;
  businessName: string;
};

const DEFAULTS: Omit<
  InboxSettings,
  'id' | 'businessId' | 'createdAt' | 'updatedAt' | 'workingHours'
> = {
  tone: 'warm',
  language: 'match',
  assignMode: 'none',
  aiReadRecords: true,
  aiAutoDraft: true,
  aiFactsOnly: true,
  aiNextAction: true,
  aiSummarise: false,
  notifyUnassigned: true,
  notifyMoney: true,
  firstReplyTargetMin: 15,
  emailReplyTargetMin: 240,
  moneyReplyTargetMin: 30,
  unassignedTargetMin: 10,
};

/**
 * Inbox settings. Uses the raw PrismaService with an explicit businessId because it is read from
 * webhook/queue processors (no request tenant) as well as from requests.
 */
@Injectable()
export class InboxSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(businessId: string): Promise<ResolvedInboxSettings> {
    const [row, business] = await Promise.all([
      this.prisma.inboxSettings.findUnique({ where: { businessId } }),
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { name: true, timezone: true, workingHours: true },
      }),
    ]);
    const own = row?.workingHours ? parseWeeklyHours(row.workingHours) : null;
    const businessHours = parseWeeklyHours(business.workingHours);
    const hours = own && hasHours(own) ? own : businessHours;
    const hoursSource =
      own && hasHours(own)
        ? 'inbox'
        : hasHours(businessHours)
          ? 'business'
          : 'none';
    const base = row ? { ...row } : { ...DEFAULTS, businessId };
    const { workingHours: _ignored, ...rest } = base as InboxSettings;
    void _ignored;
    return {
      ...DEFAULTS,
      ...rest,
      businessId,
      hours,
      hoursSource,
      timezone: business.timezone,
      businessName: business.name,
    };
  }

  async update(
    businessId: string,
    dto: UpdateInboxSettingsDto,
  ): Promise<ResolvedInboxSettings> {
    if (
      dto.tone !== undefined &&
      !(TONES as readonly string[]).includes(dto.tone)
    )
      throw this.invalid('Choose a tone from the list.');
    if (
      dto.language !== undefined &&
      !(LANGUAGES as readonly string[]).includes(dto.language)
    )
      throw this.invalid('Choose a reply language from the list.');
    if (
      dto.assignMode !== undefined &&
      !(ASSIGN_MODES as readonly string[]).includes(dto.assignMode)
    )
      throw this.invalid('Choose how conversations are handed out.');

    const data: Prisma.InboxSettingsUncheckedUpdateInput = {};
    const keys = [
      'tone',
      'language',
      'assignMode',
      'aiReadRecords',
      'aiAutoDraft',
      'aiFactsOnly',
      'aiNextAction',
      'aiSummarise',
      'notifyUnassigned',
      'notifyMoney',
      'firstReplyTargetMin',
      'emailReplyTargetMin',
      'moneyReplyTargetMin',
      'unassignedTargetMin',
    ] as const;
    for (const key of keys) {
      if (dto[key] !== undefined)
        (data as Record<string, unknown>)[key] = dto[key];
    }
    if (dto.workingHours !== undefined) {
      if (dto.workingHours === null) data.workingHours = Prisma.DbNull;
      else {
        const parsed = parseWeeklyHours(dto.workingHours);
        data.workingHours = parsed;
      }
    }
    await this.prisma.inboxSettings.upsert({
      where: { businessId },
      create: {
        ...(data as Prisma.InboxSettingsUncheckedCreateInput),
        businessId,
      },
      update: data,
    });
    return this.get(businessId);
  }

  private invalid(message: string) {
    return new AppException(
      'INBOX_SETTINGS_INVALID',
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
