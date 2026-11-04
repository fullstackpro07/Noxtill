import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { CommerceModule } from '../../commerce/commerce.module';
import { CustomersModule } from '../../customers/customers.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { ProfitModule } from '../../profit/profit.module';
import { SeoWorkspaceModule } from '../../seo-workspace/seo-workspace.module';
import { SPECIALIST_AGENT_SCHEDULE_QUEUE } from './specialist-agent-schedules.constants';
import { SpecialistAgentScheduleProcessor } from './specialist-agent-schedule.processor';
import { SpecialistAgentScheduleScheduler } from './specialist-agent-schedule.scheduler';

@Module({
  imports: [
    BullModule.registerQueue({ name: SPECIALIST_AGENT_SCHEDULE_QUEUE }),
    AnalyticsModule,
    CommerceModule,
    CustomersModule,
    InventoryModule,
    ProfitModule,
    SeoWorkspaceModule,
  ],
  providers: [
    SpecialistAgentScheduleProcessor,
    SpecialistAgentScheduleScheduler,
  ],
  exports: [SpecialistAgentScheduleProcessor],
})
export class SpecialistAgentSchedulesModule {}
