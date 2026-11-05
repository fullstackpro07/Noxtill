import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { CreditsService } from './credits.service';
import { MetersService } from './meters.service';
import { PurchasesService } from './purchases.service';
import { UsageReadService } from './usage-read.service';
import type { CommPeriod } from './usage-read.service';
import {
  CommitDto,
  PurchaseDto,
  ReleaseDto,
  ReserveDto,
  SpendCapDto,
} from './dto/usage.dto';
import { KIND_TO_OPERATION, USAGE_ERROR_CODES } from './usage.constants';

/**
 * Usage & Limits API (spec §9). Reads and purchases are for the owner and billing-permission
 * holders (spec §18); the resolved entitlement set itself is readable by any signed-in member so
 * screens can show what's available. Every call is scoped to the caller's own business.
 */
@Controller('usage')
export class UsageController {
  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly credits: CreditsService,
    private readonly meters: MetersService,
    private readonly purchases: PurchasesService,
    private readonly read: UsageReadService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('entitlements')
  entitlementSet(@CurrentUser() user: AuthenticatedUser) {
    return this.entitlements.resolve(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.read.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Get('metrics/:code')
  async metric(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
  ) {
    const set = await this.entitlements.resolve(user.businessId);
    const metric = set.metrics[code];
    if (!metric)
      throw new AppException(
        'METRIC_NOT_FOUND',
        'Unknown metric',
        HttpStatus.NOT_FOUND,
      );
    const history = await this.read.history(user.businessId, { limit: 100 });
    return {
      metric,
      period: set.usagePeriod,
      history: history.rows.filter((r) => r.metric === code),
    };
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Get('credits/by-feature')
  async byFeature(@CurrentUser() user: AuthenticatedUser) {
    const set = await this.entitlements.resolve(user.businessId);
    const [rows, recent] = await Promise.all([
      this.read.creditsByFeature(set.businessId, set.usagePeriod),
      this.read.recentReservations(user.businessId),
    ]);
    return { period: set.usagePeriod, rows, recent };
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Get('history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('q') search?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.read.history(user.businessId, {
      category,
      status,
      search,
      cursor,
      limit: 100,
    });
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Get('history.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="noxtill-usage-history.csv"',
  )
  historyCsv(@CurrentUser() user: AuthenticatedUser) {
    return this.read.historyCsv(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Get('communication')
  communication(
    @CurrentUser() user: AuthenticatedUser,
    @Query('period') period: CommPeriod = 'current',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.read.communication(user.businessId, period, from, to);
  }

  @Get('country-prices')
  async countryPrices(@Query('metric') metric = 'sms_segments') {
    const rows = await this.meters.prices();
    return rows
      .filter((r) => r.metricCode === metric && r.countryCode)
      .map((r) => ({
        countryCode: r.countryCode,
        unitPriceUsd: r.unitPriceUsd / r.per,
      }));
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Get('voice')
  voice(@CurrentUser() user: AuthenticatedUser) {
    return this.read.voice(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Put('spend-caps/:group')
  spendCap(
    @CurrentUser() user: AuthenticatedUser,
    @Param('group') group: string,
    @Body() dto: SpendCapDto,
  ) {
    if (group !== 'voice' && group !== 'messaging')
      throw new AppException(
        'SPEND_CAP_INVALID',
        'Unknown spend cap',
        HttpStatus.NOT_FOUND,
      );
    return this.meters.updateSpendCap(user.businessId, user.sub, group, dto);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Get('purchases')
  purchaseList(@CurrentUser() user: AuthenticatedUser) {
    return this.purchases.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Post('purchase')
  purchase(@CurrentUser() user: AuthenticatedUser, @Body() dto: PurchaseDto) {
    return this.purchases.start(
      user.businessId,
      user.sub,
      dto.key,
      dto.approved,
    );
  }

  /**
   * Public metering API (spec §9.2) for integrations that run model work through the Noxtill API.
   * The credit cost comes from the registered operation's band, never from the caller.
   */
  @Post('reserve')
  reserve(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReserveDto) {
    const op = Object.values(KIND_TO_OPERATION).find(
      (o) => o?.code === dto.operationCode,
    );
    if (!op)
      throw new AppException(
        USAGE_ERROR_CODES.METRIC_NOT_CONFIGURED,
        'Unknown operation',
        HttpStatus.BAD_REQUEST,
      );
    return this.credits.reserve({
      businessId: user.businessId,
      operationCode: op.code,
      band: op.band,
      idempotencyKey: `api:${dto.idempotencyKey}`,
      actorUserId: user.sub,
    });
  }

  @Post('reservations/:id/commit')
  async commit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommitDto,
  ) {
    await this.assertOwnReservation(user, id);
    return this.credits.commit(id, dto.actualQuantity);
  }

  @Post('reservations/:id/release')
  async release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReleaseDto,
  ) {
    await this.assertOwnReservation(user, id);
    await this.credits.release(id, dto.reason);
    return { released: true };
  }

  /** IS-01/02: another business's reservation is a 404, never a 403 (it isn't confirmed to exist). */
  private async assertOwnReservation(user: AuthenticatedUser, id: string) {
    const rootId = await this.entitlements.rootId(user.businessId);
    const row = await this.prisma.creditLedger.findFirst({
      where: { id, businessId: rootId },
      select: { id: true },
    });
    if (!row)
      throw new AppException(
        USAGE_ERROR_CODES.RESERVATION_NOT_FOUND,
        'Reservation not found',
        HttpStatus.NOT_FOUND,
      );
  }
}
