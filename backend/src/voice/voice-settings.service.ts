import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateVoiceSettingsDto } from './dto/update-voice-settings.dto';

const DEFAULTS = {
  voiceId: null,
  responseTimeoutSeconds: 5,
  queueHoldMessage: null,
  customIntents: [],
};

/**
 * Receptionist Settings (UPD-FE-051e depth fix) — one row per business, upsert-on-write (same
 * pattern as `CompetitiveSettingsService`/`SocialSettingsService`). Every field here is read by
 * `VoiceCallService` on the next real call — there is no separate "apply" step.
 */
@Injectable()
export class VoiceSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async get(businessId: string) {
    const existing = await this.tenantPrisma.client.voiceSettings.findUnique({
      where: { businessId },
    });
    return existing ?? { businessId, id: null, ...DEFAULTS };
  }

  async update(businessId: string, dto: UpdateVoiceSettingsDto) {
    return this.tenantPrisma.client.voiceSettings.upsert({
      where: { businessId },
      create: { businessId, ...DEFAULTS, ...dto },
      update: { ...dto },
    });
  }
}
