import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ProcurementContractsService } from '../procurement-contracts.service';
import { PROCUREMENT_CONTRACT_ALERTS_QUEUE } from './contract-alerts.constants';

@Processor(PROCUREMENT_CONTRACT_ALERTS_QUEUE)
export class ProcurementContractAlertsProcessor extends WorkerHost {
  constructor(private readonly contracts: ProcurementContractsService) {
    super();
  }

  process() {
    return this.contracts.sendRenewalAlerts();
  }
}
