import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateLoyaltyProgramDto } from './dto/create-loyalty-program.dto';
import { EnrollLoyaltyMemberDto } from './dto/enroll-loyalty-member.dto';
import { LOYALTY_ERROR_CODES } from './loyalty.constants';
import { LoyaltyProgramType, Prisma } from '../../generated/prisma';

interface LoyaltyTier {
  name: string;
  minSpend: number;
}

/**
 * Minimal transaction-client shape `issueStampIfEligible` actually uses — same hand-written-subset
 * pattern as `ReferralsService`'s `TxClient` and `booking-lock.util.ts`'s `SlotLockTx`, since
 * `$extends`-wrapped clients aren't nominally assignable to `Prisma.TransactionClient`.
 */
interface LoyaltyTxClient {
  loyaltyProgram: {
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string } | null>;
  };
  loyaltyMember: {
    upsert(args: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<{ id: string }>;
  };
  stamp: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/** Loyalty punch cards/tiers (UPD-BE-024). */
@Injectable()
export class LoyaltyService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  createProgram(dto: CreateLoyaltyProgramDto) {
    return this.tenantPrisma.client.loyaltyProgram.create({
      data: {
        name: dto.name,
        type: dto.type ?? LoyaltyProgramType.punch_card,
        stampsRequired: dto.stampsRequired ?? 10,
        rewardDescription: dto.rewardDescription,
        tiers: (dto.tiers ?? []) as unknown as Prisma.InputJsonValue,
      } as Prisma.LoyaltyProgramUncheckedCreateInput,
    });
  }

  listPrograms() {
    return this.tenantPrisma.client.loyaltyProgram.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async enroll(programId: string, dto: EnrollLoyaltyMemberDto) {
    await this.findProgram(programId);
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.tenantPrisma.client.loyaltyMember.upsert({
      where: {
        programId_customerId: { programId, customerId: dto.customerId },
      },
      create: {
        businessId: customer.businessId,
        programId,
        customerId: dto.customerId,
      },
      update: {},
    });
  }

  async listMembers(programId: string) {
    const program = await this.findProgram(programId);
    const members = await this.tenantPrisma.client.loyaltyMember.findMany({
      where: { programId },
      orderBy: { createdAt: 'asc' },
      include: { customer: true },
    });

    if (program.type === LoyaltyProgramType.tier) {
      const tiers = [
        ...((program.tiers as unknown as LoyaltyTier[]) ?? []),
      ].sort((a, b) => b.minSpend - a.minSpend);
      return members.map((member) => ({
        ...member,
        currentTier: this.computeTier(
          Number(member.customer.lifetimeSpend),
          tiers,
        ),
      }));
    }
    return members;
  }

  /** Redeems a full punch card — marks its oldest `stampsRequired` unredeemed stamps redeemed. */
  async redeem(memberId: string) {
    const member = await this.tenantPrisma.client.loyaltyMember.findUnique({
      where: { id: memberId },
      include: { program: true },
    });
    if (!member) {
      throw new NotFoundException('Loyalty member not found');
    }
    if (member.program.type !== LoyaltyProgramType.punch_card) {
      throw new AppException(
        LOYALTY_ERROR_CODES.NOT_A_PUNCH_CARD,
        'Only punch-card programs can be redeemed this way',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (member.stampCount < member.program.stampsRequired) {
      throw new AppException(
        LOYALTY_ERROR_CODES.NOT_ENOUGH_STAMPS,
        `Needs ${member.program.stampsRequired} stamps, has ${member.stampCount}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const unredeemed = await tx.stamp.findMany({
        where: { memberId, redeemed: false },
        orderBy: { createdAt: 'asc' },
        take: member.program.stampsRequired,
      });
      await tx.stamp.updateMany({
        where: { id: { in: unredeemed.map((s) => s.id) } },
        data: { redeemed: true },
      });
      return tx.loyaltyMember.update({
        where: { id: memberId },
        data: {
          stampCount: { decrement: member.program.stampsRequired },
          redeemedCount: { increment: 1 },
        },
      });
    });
  }

  /**
   * Called from `OrdersService.createSale()` inside its transaction, right next to
   * `ReferralsService.issueRewardIfEligible` — issues one stamp per sale against this business's
   * active punch-card program, auto-enrolling the customer on their first stamp. A business with
   * no active punch-card program (or a tier-only program) is a silent no-op.
   */
  async issueStampIfEligible(
    businessId: string,
    customerId: string,
    orderId: string,
    tx: LoyaltyTxClient,
  ): Promise<void> {
    const program = await tx.loyaltyProgram.findFirst({
      where: {
        businessId,
        type: LoyaltyProgramType.punch_card,
        active: true,
      },
    });
    if (!program) return;

    const member = await tx.loyaltyMember.upsert({
      where: { programId_customerId: { programId: program.id, customerId } },
      create: { businessId, programId: program.id, customerId, stampCount: 1 },
      update: { stampCount: { increment: 1 } },
    });

    await tx.stamp.create({ data: { memberId: member.id, orderId } });
  }

  private computeTier(
    lifetimeSpend: number,
    tiers: LoyaltyTier[],
  ): string | null {
    return tiers.find((t) => lifetimeSpend >= t.minSpend)?.name ?? null;
  }

  private async findProgram(id: string) {
    const program = await this.tenantPrisma.client.loyaltyProgram.findUnique({
      where: { id },
    });
    if (!program) {
      throw new AppException(
        LOYALTY_ERROR_CODES.PROGRAM_NOT_FOUND,
        'Loyalty program not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return program;
  }
}
