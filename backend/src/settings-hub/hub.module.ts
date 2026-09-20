import { Module } from '@nestjs/common';
import { SettingsHubController } from './hub.controller';
import { SettingsHubService } from './hub.service';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../common/storage/storage.module';
import { ExportsModule } from '../exports/exports.module';

@Module({
  imports: [AuthModule, RolesModule, NotificationsModule, StorageModule, ExportsModule],
  controllers: [SettingsHubController],
  providers: [SettingsHubService],
})
export class SettingsHubModule {}
