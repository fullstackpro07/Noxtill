import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { VOICE_ERROR_CODES } from './voice.constants';

interface AvailableNumbersResponse {
  available_phone_numbers: { phone_number: string }[];
}

interface IncomingNumberResponse {
  sid: string;
  phone_number: string;
}

/**
 * Telephony provider integration (UPD-BE-056) — real Twilio Voice number provisioning. Reuses the
 * same `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` already configured for SMS (`sms.service.ts`); no
 * new OAuth app, just the Voice half of the same account. Same disclosed-placeholder pattern as
 * every other external credential in this app when unconfigured.
 */
@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly config: ConfigService,
  ) {}

  async provisionNumber(businessId: string) {
    const existing = await this.tenantPrisma.client.phoneNumber.findUnique({
      where: { businessId },
    });
    if (existing) {
      throw new AppException(
        VOICE_ERROR_CODES.NUMBER_ALREADY_PROVISIONED,
        'This business already has a provisioned phone number',
        HttpStatus.CONFLICT,
      );
    }

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Voice calling is not configured yet — contact support to enable it.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const auth = { username: accountSid, password: authToken };

    const available = await axios.get<AvailableNumbersResponse>(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json`,
      { auth, params: { VoiceEnabled: true, Limit: 1 } },
    );
    const candidate = available.data.available_phone_numbers[0];
    if (!candidate) {
      throw new AppException(
        VOICE_ERROR_CODES.NO_NUMBERS_AVAILABLE,
        'No phone numbers are currently available to provision — please try again shortly.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const backendUrl = this.config.get<string>('BACKEND_URL') ?? '';
    const purchased = await axios.post<IncomingNumberResponse>(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
      new URLSearchParams({
        PhoneNumber: candidate.phone_number,
        VoiceUrl: `${backendUrl}/voice/webhook/incoming`,
        VoiceMethod: 'POST',
        StatusCallback: `${backendUrl}/voice/webhook/status`,
        StatusCallbackMethod: 'POST',
      }),
      { auth },
    );

    const phoneNumber = await this.tenantPrisma.client.phoneNumber.create({
      data: {
        businessId,
        twilioSid: purchased.data.sid,
        phoneNumber: purchased.data.phone_number,
      },
    });

    this.logger.log(
      `Provisioned voice number ${phoneNumber.phoneNumber} for business ${businessId}`,
    );
    return phoneNumber;
  }

  getNumber(businessId: string) {
    return this.tenantPrisma.client.phoneNumber.findUnique({
      where: { businessId },
    });
  }
}
