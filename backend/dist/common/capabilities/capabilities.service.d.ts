import { PrismaService } from '../../prisma/prisma.service';
import { Capability } from './capabilities.constants';
import { Role } from '../../../generated/prisma';
export declare class CapabilitiesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    resolve(businessUser: {
        role: Role;
        customRoleId: string | null;
    }): Promise<Capability[]>;
}
