import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { WebsiteBuilderService } from './website-builder.service';
import { WebsiteDomainsService } from './website-domains.service';
import { WebsiteFormsService } from './website-forms.service';
import { WebsiteOverviewService } from './website-overview.service';
import { WebsitePublicController } from './website-public.controller';
import { WebsitePublicService } from './website-public.service';
import { WebsiteStorefrontService } from './website-storefront.service';
import { WebsiteController } from './website.controller';
import { WebsiteService } from './website.service';
import { WEBSITE_PUBLISH_QUEUE } from './jobs/website-publish.constants';
import { WebsitePublishProcessor } from './jobs/website-publish.processor';
import { WebsitePublishScheduler } from './jobs/website-publish.scheduler';

@Module({
  imports: [
    AiModule,
    BullModule.registerQueue({ name: WEBSITE_PUBLISH_QUEUE }),
  ],
  controllers: [WebsiteController, WebsitePublicController],
  providers: [
    WebsiteService,
    WebsiteOverviewService,
    WebsiteFormsService,
    WebsiteDomainsService,
    WebsiteStorefrontService,
    WebsiteBuilderService,
    WebsitePublicService,
    WebsitePublishScheduler,
    WebsitePublishProcessor,
  ],
  exports: [WebsiteService],
})
export class WebsiteModule {}
