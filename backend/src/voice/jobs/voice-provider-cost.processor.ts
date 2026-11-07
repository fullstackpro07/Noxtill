import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';
import { VOICE_PROVIDER_COST_QUEUE } from '../voice.constants';
import { VoiceUsageMeteringService } from '../voice-usage-metering.service';

const LOOKBACK_DAYS = 3;
/** Twilio prices a call a little after it ends; a call with no price yet is retried every tick until it is this old, then left unpriced. */
const GIVE_UP_AFTER_HOURS = 24;

interface TwilioCallResource {
  duration?: string | null;
  price: string | null;
  price_unit: string | null;
}

interface TwilioMessageResource {
  price?: string | null;
  price_unit?: string | null;
  num_segments?: string | null;
  status?: string | null;
  date_sent?: string | null;
}

/**
 * AI Phone, full — "Provider cost" (Numbers screen / telephony account card) was previously
 * disclosed as "Not reported" because nothing ever asked Twilio what a call actually cost. This
 * job asks Twilio's own Call resource for every ended call from the last few days that hasn't been
 * checked yet, and records exactly what comes back — `price` is a real but sometimes-delayed
 * figure on Twilio's side, so a call with no price yet is simply asked about again on the next hourly tick
 * (and left unpriced after a day); this never estimates a number in its place.
 */
@Processor(VOICE_PROVIDER_COST_QUEUE)
export class VoiceProviderCostProcessor extends WorkerHost {
  private readonly logger = new Logger(VoiceProviderCostProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly metering?: VoiceUsageMeteringService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runCheck();
  }

  async runCheck(): Promise<void> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) return;
    const auth = { username: accountSid, password: authToken };

    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const calls = await this.prisma.phoneCall.findMany({
      where: {
        startedAt: { gte: since },
        endedAt: { not: null },
        providerCostCheckedAt: null,
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });

    let checked = 0;
    let priced = 0;
    for (const call of calls) {
      try {
        const { data } = await axios.get<TwilioCallResource>(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${call.callSid}.json`,
          { auth },
        );
        const raw = data.price != null ? Math.abs(Number(data.price)) : null;
        await this.metering?.recordProviderCall(call.id, data);
        const price = raw != null && !Number.isNaN(raw) ? raw : null;
        const ageHours = call.endedAt
          ? (Date.now() - call.endedAt.getTime()) / 3_600_000
          : 0;
        if (price == null && ageHours < GIVE_UP_AFTER_HOURS) {
          // Not priced yet — leave it unchecked so the next tick asks again.
          checked += 1;
          continue;
        }
        await this.prisma.phoneCall.update({
          where: { id: call.id },
          data: {
            providerCost: price,
            providerCostUnit: data.price_unit ?? null,
            providerCostCheckedAt: new Date(),
          },
        });
        checked += 1;
        if (price != null) priced += 1;
      } catch (error) {
        this.logger.warn(
          `Provider cost check failed for call ${call.callSid}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Provider cost check: ${priced}/${checked} of ${calls.length} call(s) had a price from Twilio`,
    );
    const sms = await this.checkMissedCallSms(accountSid, auth);
    this.logger.debug(
      `Provider cost check: ${sms.priced}/${sms.checked} missed-call SMS message(s) had a price from Twilio`,
    );
  }

  async runMessageCheck() {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken || !this.metering)
      return { checked: 0, priced: 0 };
    return this.checkMissedCallSms(accountSid, {
      username: accountSid,
      password: authToken,
    });
  }

  private async checkMissedCallSms(
    accountSid: string,
    auth: { username: string; password: string },
  ) {
    if (!this.metering) return { checked: 0, priced: 0 };
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const calls = await this.prisma.phoneCall.findMany({
      where: {
        textBackMessageId: { not: null },
        isTestCall: false,
        createdAt: { gte: since },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 500,
      select: { id: true, businessId: true, textBackMessageId: true },
    });
    let checked = 0;
    let priced = 0;
    for (const call of calls) {
      if (!call.textBackMessageId) continue;
      const message = await this.prisma.message.findFirst({
        where: {
          id: call.textBackMessageId,
          businessId: call.businessId,
          channel: 'sms',
          status: { in: ['sent', 'delivered', 'read'] },
          providerRef: { not: null },
        },
        select: { id: true, providerRef: true, createdAt: true },
      });
      const sid = message?.providerRef;
      if (!message || !sid || !/^(SM|MM)[0-9a-f]{32}$/i.test(sid)) continue;

      const eventKey = `twilio:sms:${sid}`;
      const existing = await this.prisma.voiceUsageRecord.findUnique({
        where: {
          businessId_eventKey: { businessId: call.businessId, eventKey },
        },
        select: { state: true },
      });
      if (existing && existing.state !== 'pending') continue;

      try {
        const { data } = await axios.get<TwilioMessageResource>(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`,
          { auth },
        );
        const ageHours = (Date.now() - message.createdAt.getTime()) / 3_600_000;
        await this.metering.recordProviderSms(
          call.businessId,
          message.id,
          sid,
          data,
          ageHours >= GIVE_UP_AFTER_HOURS,
        );
        checked += 1;
        if (
          data.price != null &&
          data.price_unit &&
          /^[A-Za-z]{3}$/.test(data.price_unit)
        )
          priced += 1;
      } catch (error) {
        this.logger.warn(
          `Provider SMS cost check failed for Twilio message ${sid}: ${(error as Error).message}`,
        );
      }
    }
    return { checked, priced };
  }
}
