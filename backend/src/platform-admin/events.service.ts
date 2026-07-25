import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { Prisma } from '../../generated/prisma';

/**
 * Generic instrumentation (BE-072). Deliberately not tenant-scoped: events
 * can be recorded before a business exists (e.g. `signup_started`), and
 * admin reporting needs to read across every business — so this always
 * goes through the raw PrismaService, with businessId/userId as plain
 * optional columns rather than an enforced tenant boundary.
 */
@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  record(dto: CreateEventDto) {
    return this.prisma.event.create({
      data: {
        name: dto.name,
        businessId: dto.businessId,
        userId: dto.userId,
        properties: (dto.properties ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
