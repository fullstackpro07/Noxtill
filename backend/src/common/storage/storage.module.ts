import { Global, Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { LocalFilesController } from './local-files.controller';

@Global()
@Module({
  controllers: [LocalFilesController],
  providers: [S3Service],
  exports: [S3Service],
})
export class StorageModule {}
