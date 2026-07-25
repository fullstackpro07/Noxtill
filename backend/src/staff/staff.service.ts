import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { STAFF_ERROR_CODES, TEMP_PASSWORD_BYTES } from './staff.constants';
import { Prisma, Role } from '../../generated/prisma';

const BCRYPT_ROUNDS = 10;

/**
 * Staff CRUD (BE-056) — owner-only (enforced by @Roles(Role.owner) at the
 * controller). Inviting staff creates a real User account (a person may
 * already have one from another business, e.g. a contractor working two
 * shops) plus a BusinessUser row scoping their role/commission to this
 * business specifically.
 */
@Injectable()
export class StaffService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list() {
    return this.tenantPrisma.client.businessUser.findMany({
      where: { role: { in: [Role.manager, Role.staff] } },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(businessId: string, dto: CreateStaffDto) {
    if (!dto.email && !dto.phone) {
      throw new AppException(
        STAFF_ERROR_CODES.IDENTITY_REQUIRED,
        'An email or phone number is required to invite staff',
        HttpStatus.BAD_REQUEST,
      );
    }

    const identityFilters: Prisma.UserWhereInput[] = [];
    if (dto.email) identityFilters.push({ email: dto.email });
    if (dto.phone) identityFilters.push({ phone: dto.phone });

    let user = await this.tenantPrisma.client.user.findFirst({
      where: { OR: identityFilters },
    });

    let tempPassword: string | undefined;
    if (user) {
      const existingLink =
        await this.tenantPrisma.client.businessUser.findUnique({
          where: { businessId_userId: { businessId, userId: user.id } },
        });
      if (existingLink) {
        throw new AppException(
          STAFF_ERROR_CODES.ALREADY_STAFF,
          'This person is already staff at this business',
          HttpStatus.CONFLICT,
        );
      }
    } else {
      tempPassword = randomBytes(TEMP_PASSWORD_BYTES).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
      user = await this.tenantPrisma.client.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
        },
      });
    }

    const businessUser = await this.tenantPrisma.client.businessUser.create({
      data: {
        businessId,
        userId: user.id,
        role: dto.role,
        commissionRule: (dto.commissionRule ?? {}) as Prisma.InputJsonValue,
      },
      include: { user: true },
    });

    return { ...businessUser, tempPassword };
  }

  async update(id: string, dto: UpdateStaffDto) {
    const existing = await this.loadNonOwner(id);

    return this.tenantPrisma.client.businessUser.update({
      where: { id: existing.id },
      data: {
        role: dto.role,
        commissionRule: dto.commissionRule as Prisma.InputJsonValue | undefined,
      },
      include: { user: true },
    });
  }

  async remove(id: string) {
    const existing = await this.loadNonOwner(id);
    await this.tenantPrisma.client.businessUser.delete({
      where: { id: existing.id },
    });
    return { success: true };
  }

  private async loadNonOwner(id: string) {
    const businessUser = await this.tenantPrisma.client.businessUser.findUnique(
      {
        where: { id },
      },
    );
    if (!businessUser) {
      throw new NotFoundException('Staff member not found');
    }
    if (businessUser.role === Role.owner) {
      throw new AppException(
        STAFF_ERROR_CODES.CANNOT_MODIFY_OWNER,
        "The business owner's role cannot be changed here",
        HttpStatus.FORBIDDEN,
      );
    }
    return businessUser;
  }
}
