import { Module } from '@nestjs/common';
import { IntegrationDirectoryService } from './integration-directory.service';
import { IntegrationDirectoryController } from './integration-directory.controller';
import { IntegrationsModule } from '../integrations.module';
import { SocialModule } from '../../social/social.module';

@Module({
  imports: [IntegrationsModule, SocialModule],
  controllers: [IntegrationDirectoryController],
  providers: [IntegrationDirectoryService],
})
export class IntegrationDirectoryModule {}
