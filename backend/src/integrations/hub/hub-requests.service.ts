import { Injectable } from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

export const REQUEST_DIRECTIONS = ['Inbound', 'Outbound', 'Two-way'] as const;

export class CreateIntegrationRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  providerName!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  useCase!: string;

  @IsIn([...REQUEST_DIRECTIONS])
  direction!: (typeof REQUEST_DIRECTIONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(191)
  contactEmail?: string;
}

/** "Request an integration" — a real, counted request per provider across businesses. */
@Injectable()
export class HubRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private keyOf(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async create(
    businessId: string,
    userId: string | undefined,
    userEmail: string | undefined,
    dto: CreateIntegrationRequestDto,
  ) {
    const providerKey = this.keyOf(dto.providerName);
    await this.prisma.integrationRequest.create({
      data: {
        businessId,
        providerName: dto.providerName.trim(),
        providerKey,
        useCase: dto.useCase.trim(),
        direction: dto.direction,
        requestedByUserId: userId,
        contactEmail: dto.contactEmail?.trim() || userEmail || null,
      },
    });
    const businessesRequesting = await this.prisma.integrationRequest.groupBy({
      by: ['businessId'],
      where: { providerKey },
    });
    await this.audit.log({
      entity: 'Integration',
      entityId: `request:${providerKey}`,
      action: 'integration.requested',
      after: { provider: dto.providerName.trim(), direction: dto.direction },
    });
    return { providerKey, businessesRequesting: businessesRequesting.length };
  }
}
