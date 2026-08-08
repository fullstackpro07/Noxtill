import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { GooglePlacesService } from '../google-places.service';
export declare class CompetitorSnapshotProcessor extends WorkerHost {
    private readonly prisma;
    private readonly googlePlaces;
    private readonly logger;
    constructor(prisma: PrismaService, googlePlaces: GooglePlacesService);
    process(job: Job): Promise<void>;
    runSnapshot(): Promise<void>;
    snapshotOne(competitorId: string, platformRef: string): Promise<void>;
}
