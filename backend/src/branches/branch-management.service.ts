import { HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateBranchDto } from './dto/create-branch.dto';
import { slugify } from '../common/utils/slug.util';
import {
  BRANCH_ERROR_CODES,
  BRANCH_TEMP_PASSWORD_BYTES,
} from './branches.constants';
import { Prisma, Role } from '@prisma/client';

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
}
