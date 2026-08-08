import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Composes the session shape the frontend needs after login: current user (with role from the JWT) + their business + its branches. */
  async me(authUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.sub },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const business = await this.prisma.business.findUnique({
      where: { id: authUser.businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        locale: true,
        timezone: true,
        country: true,
        parentId: true,
        branches: { select: { id: true, name: true } },
      },
    });
    if (!business) throw new NotFoundException('Business not found');

    // The staff-scoped BusinessUser row's own id (distinct from the person's User.id) — needed by
    // the frontend to match "assigned to me" against Appointment.staffUserId / PrivateFeedback.assignedTo.
    const businessUser = await this.prisma.businessUser.findUnique({
      where: {
        businessId_userId: { businessId: authUser.businessId, userId: authUser.sub },
      },
      select: { id: true },
    });

    return {
      user: { ...user, role: authUser.role, businessUserId: businessUser?.id ?? null },
      business,
    };
  }
}
