import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { slugify } from '../common/utils/slug.util';
import {
  BRANCH_ERROR_CODES,
  BRANCH_TEMP_PASSWORD_BYTES,
} from './branches.constants';
import { Prisma, Role } from '@prisma/client';

/** The settings fields "copy from another branch" actually copies — deliberately excludes
 * identity fields (name, slug, currency) and the `active` flag. */
const COPYABLE_SETTINGS_FIELDS = [
  'nightlyCloseTime',
  'taxLabel',
  'taxRate',
  'channelPref',
  'workingHours',
  'branding',
  'acceptedPaymentMethods',
] as const satisfies readonly (keyof Prisma.BusinessUpdateInput)[];

const BCRYPT_ROUNDS = 10;

/**
 * Branch CRUD (UPD-BE-036 follow-up) — branches are `Business` rows linked by `parentId`, but
 * nothing in this codebase could ever create one; `RollupService`/`StockTransfersService` both
 * assume the group already exists. Uses the raw `PrismaService`, not `TenantPrismaService` — the
 * caller's own business becomes the new branch's *parent* (or sibling's parent, if the caller is
 * itself already a branch — the hierarchy stays flat, matching `RollupService.getGroup`'s
 * `rootId = business.parentId ?? business.id` assumption), which is a write to a row the caller
 * doesn't tenant-own yet.
 */
@Injectable()
export class BranchManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async create(callerBusinessId: string, dto: CreateBranchDto) {
    if (!dto.ownerEmail && !dto.ownerPhone) {
      throw new AppException(
        BRANCH_ERROR_CODES.IDENTITY_REQUIRED,
        'An email or phone number is required for the new branch owner',
        HttpStatus.BAD_REQUEST,
      );
    }

    const caller = await this.prisma.business.findUniqueOrThrow({
      where: { id: callerBusinessId },
    });
    const rootId = caller.parentId ?? caller.id;

    const identityFilters: Prisma.UserWhereInput[] = [];
    if (dto.ownerEmail) identityFilters.push({ email: dto.ownerEmail });
    if (dto.ownerPhone) identityFilters.push({ phone: dto.ownerPhone });

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: identityFilters },
    });

    const branch = await this.prisma.business.create({
      data: {
        name: dto.name,
        slug: slugify(dto.name),
        parentId: rootId,
        country: dto.country,
        currency: dto.currency ?? caller.currency,
        timezone: dto.timezone ?? caller.timezone,
      },
    });

    let tempPassword: string | undefined;
    let user = existingUser;
    if (!user) {
      tempPassword = randomBytes(BRANCH_TEMP_PASSWORD_BYTES).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
      user = await this.prisma.user.create({
        data: {
          name: dto.ownerName,
          email: dto.ownerEmail,
          phone: dto.ownerPhone,
          passwordHash,
        },
      });
    }

    const businessUser = await this.prisma.businessUser.create({
      data: { businessId: branch.id, userId: user.id, role: Role.owner },
      include: { user: true },
    });

    return { business: branch, businessUser, tempPassword };
  }

  /** The branch group a business belongs to: itself, its parent (if it's a branch), and all siblings. */
  async list(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const rootId = business.parentId ?? business.id;

    return this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** UPD-BE-109 — updates a branch's own settings; `callerBusinessId` just proves group membership, the write always targets `branchId`. */
  async update(
    callerBusinessId: string,
    branchId: string,
    dto: UpdateBranchDto,
  ) {
    await this.assertSameGroup(callerBusinessId, branchId);
    return this.prisma.business.update({
      where: { id: branchId },
      data: dto as Prisma.BusinessUpdateInput,
    });
  }

  /** Soft-deactivation — the root business (no `parentId`) can never be deactivated, since that would orphan the whole group. */
  async deactivate(callerBusinessId: string, branchId: string) {
    await this.assertSameGroup(callerBusinessId, branchId);
    const branch = await this.prisma.business.findUniqueOrThrow({
      where: { id: branchId },
    });
    if (!branch.parentId) {
      throw new AppException(
        BRANCH_ERROR_CODES.CANNOT_DEACTIVATE_ROOT,
        'The main branch cannot be deactivated',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.prisma.business.update({
      where: { id: branchId },
      data: { active: false },
    });
  }

  async reactivate(callerBusinessId: string, branchId: string) {
    await this.assertSameGroup(callerBusinessId, branchId);
    return this.prisma.business.update({
      where: { id: branchId },
      data: { active: true },
    });
  }

  /** Copies the real settings fields (hours/tax/branding/channel/payment methods) from one branch onto another — both must be in the caller's own group. */
  async copySettings(
    callerBusinessId: string,
    targetBranchId: string,
    fromBranchId: string,
  ) {
    await this.assertSameGroup(callerBusinessId, targetBranchId);
    await this.assertSameGroup(callerBusinessId, fromBranchId);

    const source = await this.prisma.business.findUniqueOrThrow({
      where: { id: fromBranchId },
    });
    const data = Object.fromEntries(
      COPYABLE_SETTINGS_FIELDS.map((field) => [field, source[field]]),
    ) as Prisma.BusinessUpdateInput;

    return this.prisma.business.update({
      where: { id: targetBranchId },
      data,
    });
  }

  private async assertSameGroup(callerBusinessId: string, branchId: string) {
    const caller = await this.prisma.business.findUnique({
      where: { id: callerBusinessId },
    });
    if (!caller) {
      throw new NotFoundException('Business not found');
    }
    const rootId = caller.parentId ?? caller.id;
    const target = await this.prisma.business.findFirst({
      where: { id: branchId, OR: [{ id: rootId }, { parentId: rootId }] },
    });
    if (!target) {
      throw new AppException(
        BRANCH_ERROR_CODES.NOT_SAME_GROUP,
        'That branch is not part of your business group',
        HttpStatus.FORBIDDEN,
      );
    }
    return target;
  }
}
