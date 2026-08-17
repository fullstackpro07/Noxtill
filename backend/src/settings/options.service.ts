import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  CreateOptionDto,
  CreateOptionSetDto,
  ReorderOptionsDto,
  UpdateOptionDto,
} from './dto/option-set.dto';
import { OPTION_ERROR_CODES } from './options.constants';
import { Prisma } from '../../generated/prisma';

/**
 * Custom Options manager (UPD-BE-039) — net-new (no prior `CRUD /options/:setKey` existed to
 * generalize, confirmed by research). A business freely creates named lists (`setKey`) and
 * manages their values — rename, reorder, hide/show. Not yet wired as validation on any
 * existing free-text column (`Product.category`, `Expense.category`) — a real, disclosed scope
 * boundary; this ticket is the standalone list-management feature itself.
 */
@Injectable()
export class OptionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createSet(businessId: string, dto: CreateOptionSetDto) {
    try {
      return await this.tenantPrisma.client.optionSet.create({
        data: {
          businessId,
          setKey: dto.setKey,
          label: dto.label,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppException(
          OPTION_ERROR_CODES.DUPLICATE_SET_KEY,
          `An option set with key "${dto.setKey}" already exists`,
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  /** The one "cross-list manager" view — every set with its options, in display order. */
  listAll() {
    return this.tenantPrisma.client.optionSet.findMany({
      orderBy: { createdAt: 'asc' },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async addOption(setKey: string, dto: CreateOptionDto) {
    const set = await this.findSet(setKey);
    const last = await this.tenantPrisma.client.option.findFirst({
      where: { optionSetId: set.id },
      orderBy: { sortOrder: 'desc' },
    });

    return this.tenantPrisma.client.option.create({
      data: {
        optionSetId: set.id,
        value: dto.value,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateOption(setKey: string, optionId: string, dto: UpdateOptionDto) {
    await this.findOption(setKey, optionId);
    return this.tenantPrisma.client.option.update({
      where: { id: optionId },
      data: { value: dto.value, hidden: dto.hidden },
    });
  }

  async removeOption(setKey: string, optionId: string) {
    await this.findOption(setKey, optionId);
    await this.tenantPrisma.client.option.delete({ where: { id: optionId } });
  }

  /** Re-sequences every option in the set to match the order of `orderedIds` exactly. */
  async reorder(setKey: string, dto: ReorderOptionsDto) {
    const set = await this.findSet(setKey);
    const options = await this.tenantPrisma.client.option.findMany({
      where: { optionSetId: set.id },
    });
    const realIds = new Set(options.map((o) => o.id));
    const orderedRealIds = dto.orderedIds.filter((id) => realIds.has(id));
    if (orderedRealIds.length !== options.length) {
      throw new AppException(
        OPTION_ERROR_CODES.OPTION_NOT_FOUND,
        'orderedIds must include every real option in this set, exactly once',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.tenantPrisma.client.$transaction(
      orderedRealIds.map((id, index) =>
        this.tenantPrisma.client.option.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.tenantPrisma.client.option.findMany({
      where: { optionSetId: set.id },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async findSet(setKey: string) {
    const set = await this.tenantPrisma.client.optionSet.findFirst({
      where: { setKey },
    });
    if (!set) {
      throw new NotFoundException(`Option set "${setKey}" not found`);
    }
    return set;
  }

  private async findOption(setKey: string, optionId: string) {
    const set = await this.findSet(setKey);
    const option = await this.tenantPrisma.client.option.findUnique({
      where: { id: optionId },
    });
    if (!option || option.optionSetId !== set.id) {
      throw new NotFoundException('Option not found in this set');
    }
    return option;
  }
}
