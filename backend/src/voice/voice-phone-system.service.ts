import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { VOICE_ERROR_CODES } from './voice.constants';

const MAX_TEST_NUMBERS = 10;
const TRUNK_SID = /^TK[0-9a-fA-F]{32}$/;

/** Inbound-call hook (no request tenant): is this caller one of the business's test numbers? */
export async function isTestCaller(
  prisma: Pick<Prisma.TransactionClient, 'voiceSettings'>,
  businessId: string,
  fromNumber: string,
): Promise<boolean> {
  const settings = await prisma.voiceSettings.findUnique({
    where: { businessId },
    select: { testCallerNumbers: true },
  });
  const numbers = Array.isArray(settings?.testCallerNumbers)
    ? (settings.testCallerNumbers as unknown[])
    : [];
  return numbers.includes(fromNumber);
}

interface TwilioTrunk {
  sid: string;
  friendly_name: string | null;
  domain_name: string | null;
}

/**
 * Receptionist Settings — phone-system connection and test numbers. A SIP trunk is only saved
 * after the provider confirms it exists in the connected account; its routing is read live.
 */
@Injectable()
export class VoicePhoneSystemService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async get(businessId: string) {
    const settings = await this.tenantPrisma.client.voiceSettings.findUnique({
      where: { businessId },
      select: { testCallerNumbers: true, sipTrunkSid: true },
    });
    const testCallerNumbers = Array.isArray(settings?.testCallerNumbers)
      ? (settings.testCallerNumbers as string[])
      : [];
    return {
      testCallerNumbers,
      sipTrunk: settings?.sipTrunkSid
        ? await this.describeTrunk(businessId, settings.sipTrunkSid)
        : null,
    };
  }

  async setTestNumbers(businessId: string, numbers: string[]) {
    const normalized: string[] = [];
    for (const raw of numbers) {
      const parsed = parsePhoneNumberFromString(raw.trim());
      if (!parsed?.isValid()) {
        throw this.invalid(
          `"${raw}" is not a valid international phone number.`,
        );
      }
      if (!normalized.includes(parsed.number)) normalized.push(parsed.number);
    }
    if (normalized.length > MAX_TEST_NUMBERS) {
      throw this.invalid(`Add at most ${MAX_TEST_NUMBERS} test numbers.`);
    }
    await this.tenantPrisma.client.voiceSettings.upsert({
      where: { businessId },
      create: { businessId, testCallerNumbers: normalized },
      update: { testCallerNumbers: normalized },
    });
    await this.audit.log({
      entity: 'VoiceSettings',
      entityId: businessId,
      action: 'voice.settings.test_numbers_updated',
      after: { count: normalized.length },
    });
    return { testCallerNumbers: normalized };
  }

  async connectTrunk(businessId: string, sid: string) {
    if (!TRUNK_SID.test(sid.trim())) {
      throw this.invalid(
        'A Twilio SIP trunk id starts with TK followed by 32 characters.',
      );
    }
    const auth = this.auth();
    let trunk: TwilioTrunk;
    try {
      trunk = (
        await axios.get<TwilioTrunk>(
          `https://trunking.twilio.com/v1/Trunks/${sid.trim()}`,
          {
            auth,
            timeout: 8000,
          },
        )
      ).data;
    } catch {
      throw new AppException(
        VOICE_ERROR_CODES.TRACKING_NUMBER_NOT_OWNED,
        'That SIP trunk was not found in the connected Twilio account.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.tenantPrisma.client.voiceSettings.upsert({
      where: { businessId },
      create: { businessId, sipTrunkSid: trunk.sid },
      update: { sipTrunkSid: trunk.sid },
    });
    await this.audit.log({
      entity: 'VoiceSettings',
      entityId: businessId,
      action: 'voice.settings.sip_trunk_connected',
      after: { trunkSid: trunk.sid, name: trunk.friendly_name },
    });
    return this.describeTrunk(businessId, trunk.sid);
  }

  async disconnectTrunk(businessId: string) {
    await this.tenantPrisma.client.voiceSettings.updateMany({
      where: { businessId },
      data: { sipTrunkSid: null },
    });
    await this.audit.log({
      entity: 'VoiceSettings',
      entityId: businessId,
      action: 'voice.settings.sip_trunk_disconnected',
    });
    return { sipTrunk: null };
  }

  /** Live read of the trunk: name, origination targets and whether the business line is on it. */
  async describeTrunk(businessId: string, sid: string) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      return {
        sid,
        verified: false,
        detail:
          'Provider credentials are not set, so the trunk cannot be read.',
      };
    }
    const auth = { username: accountSid, password: authToken };
    const base = `https://trunking.twilio.com/v1/Trunks/${sid}`;
    try {
      const [trunk, origination, numbers, line] = await Promise.all([
        axios.get<TwilioTrunk>(base, { auth, timeout: 8000 }),
        axios.get<{
          origination_urls: { sip_url: string; enabled: boolean }[];
        }>(`${base}/OriginationUrls`, { auth, timeout: 8000 }),
        axios.get<{ phone_numbers: { phone_number: string }[] }>(
          `${base}/PhoneNumbers`,
          { auth, timeout: 8000 },
        ),
        this.tenantPrisma.client.phoneNumber.findUnique({
          where: { businessId },
          select: { phoneNumber: true },
        }),
      ]);
      const trunkNumbers = numbers.data.phone_numbers.map(
        (n) => n.phone_number,
      );
      const lineOnTrunk = !!line && trunkNumbers.includes(line.phoneNumber);
      return {
        sid,
        verified: true,
        name: trunk.data.friendly_name,
        domain: trunk.data.domain_name,
        originationUrls: origination.data.origination_urls.map((o) => ({
          sipUrl: o.sip_url,
          enabled: o.enabled,
        })),
        phoneNumbers: trunkNumbers,
        businessLineOnTrunk: lineOnTrunk,
        detail: lineOnTrunk
          ? 'Your business number is assigned to this trunk, so its calls go to your phone system instead of the Noxtill receptionist.'
          : 'Your business number still routes to the Noxtill receptionist; numbers on this trunk ring your phone system.',
      };
    } catch {
      return {
        sid,
        verified: false,
        detail: 'The provider could not return this trunk just now.',
      };
    }
  }

  private auth() {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Voice calling is not configured on this server.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { username: accountSid, password: authToken };
  }

  private invalid(message: string) {
    return new AppException(
      'VOICE_PHONE_SYSTEM_INVALID',
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
