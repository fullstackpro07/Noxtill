import { Module } from '@nestjs/common';
import { LegalPublicController } from './legal-public.controller';
import { LegalPublicService } from './legal-public.service';

@Module({
  controllers: [LegalPublicController],
  providers: [LegalPublicService],
})
export class LegalPublicModule {}
