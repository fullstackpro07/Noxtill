import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  CreateCustomRoleDto,
  UpdateCustomRoleDto,
} from './dto/create-custom-role.dto';
import { CUSTOM_ROLE_ERROR_CODES } from './roles.constants';
import { ALL_CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { Prisma } from '../../generated/prisma';

/**
 * Custom roles (UPD-BE-035) — a business-defined name + capability subset. System roles
 * (owner/manager/staff) aren't managed here; they're the fixed defaults every `BusinessUser`
 * starts with (see `SYSTEM_ROLE_CAPABILITIES`) until deliberately assigned a custom role instead.
 */
@Injectable()
export class CustomRolesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(businessId: string, dto: CreateCustomRoleDto) {
    this.assertKnownCapabilities(dto.capabilities);

    try {
      return await this.tenantPrisma.client.customRole.create({
        data: {
          businessId,
          name: dto.name,
          capabilities: dto.capabilities,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppException(
          CUSTOM_ROLE_ERROR_CODES.DUPLICATE_NAME,
          `A role named "${dto.name}" already exists`,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  list() {
    return this.tenantPrisma.client.customRole.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.tenantPrisma.client.customRole.findUnique({
      where: { id },
    });
    if (!role) {
      throw new NotFoundException('Custom role not found');
    }
    return role;
  }

  async update(id: string, dto: UpdateCustomRoleDto) {
    await this.findOne(id);
    if (dto.capabilities) {
      this.assertKnownCapabilities(dto.capabilities);
    }
    return this.tenantPrisma.client.customRole.update({
      where: { id },
      data: { name: dto.name, capabilities: dto.capabilities },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const assignedCount = await this.tenantPrisma.client.businessUser.count({
      where: { customRoleId: id },
    });
    if (assignedCount > 0) {
      throw new AppException(
        CUSTOM_ROLE_ERROR_CODES.IN_USE,
        `${assignedCount} staff member(s) still have this role — reassign them first`,
        HttpStatus.CONFLICT,
      );
    }
    await this.tenantPrisma.client.customRole.delete({ where: { id } });
  }

  private assertKnownCapabilities(capabilities: string[]): void {
    const unknown = capabilities.filter(
      (c) => !ALL_CAPABILITIES.includes(c as (typeof ALL_CAPABILITIES)[number]),
    );
    if (unknown.length > 0) {
      throw new AppException(
        CUSTOM_ROLE_ERROR_CODES.UNKNOWN_CAPABILITY,
        `Unknown capability key(s): ${unknown.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
