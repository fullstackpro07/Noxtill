import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DataExportsService } from './data-exports.service';
import { DATA_EXPORTS_QUEUE } from './exports.constants';

@Processor(DATA_EXPORTS_QUEUE)
export class DataExportsProcessor extends WorkerHost {
  constructor(private readonly dataExports: DataExportsService) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<void> {
    await this.dataExports.process(job.data.jobId);
  }
}
