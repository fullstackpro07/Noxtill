import { Global, Module } from '@nestjs/common';
import { EntitlementCacheService } from './entitlement-cache.service';
import { EntitlementsService } from './entitlements.service';
import { CreditsService } from './credits.service';
import { MetersService } from './meters.service';
import { RemediesService } from './remedies.service';

/**
 * The enforcement core of Usage & Limits, global so every feature module (AI infra, staff,
 * branches, messaging, voice, automations…) can check and record usage without import wiring.
 * Depends only on Prisma and config, so it can never form an import cycle with a feature module.
 */
@Global()
@Module({
  providers: [
    EntitlementCacheService,
    EntitlementsService,
    CreditsService,
    MetersService,
    RemediesService,
  ],
  exports: [
    EntitlementsService,
    CreditsService,
    MetersService,
    RemediesService,
  ],
})
export class UsageCoreModule {}
