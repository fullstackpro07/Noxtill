import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
export declare class TenancyGuard implements CanActivate {
    private readonly cls;
    private readonly prisma;
    constructor(cls: ClsService, prisma: PrismaService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private resolveBranchId;
}
