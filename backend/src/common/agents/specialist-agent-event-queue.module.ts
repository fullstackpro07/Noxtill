import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import {
  SPECIALIST_AGENT_EVENTS_QUEUE,
  SPECIALIST_AGENT_CUSTOMER_EVENTS_QUEUE,
  SPECIALIST_AGENT_COMMERCE_EVENTS_QUEUE,
  SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE,
  SPECIALIST_AGENT_INVENTORY_EVENTS_QUEUE,
} from './specialist-agent-events.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: SPECIALIST_AGENT_EVENTS_QUEUE },
      { name: SPECIALIST_AGENT_INVENTORY_EVENTS_QUEUE },
      { name: SPECIALIST_AGENT_CUSTOMER_EVENTS_QUEUE },
      { name: SPECIALIST_AGENT_COMMERCE_EVENTS_QUEUE },
      { name: SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class SpecialistAgentEventQueueModule {}
