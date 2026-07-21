import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { CustomerImportService } from './customer-import.service';
import { CUSTOMER_IMPORT_QUEUE } from './customer-import.constants';

interface ExecuteJobData {
  businessId: string;
  batchId: string;
}

@Processor(CUSTOMER_IMPORT_QUEUE)
export class CustomerImportProcessor extends WorkerHost {
  private readonly logger = new Logger(CustomerImportProcessor.name);

  constructor(private readonly importService: CustomerImportService) {
    super();
  }

  async process(job: Job<ExecuteJobData>): Promise<void> {
    await this.importService.executeBatch(
      job.data.businessId,
      job.data.batchId,
    );
    this.logger.debug(`Customer import batch ${job.data.batchId} executed`);
  }
}
