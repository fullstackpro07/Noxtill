import {
  Controller,
  Get,
  NotFoundException,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { S3Service } from './s3.service';

/**
 * Serves files written by `S3Service`'s local-disk fallback (dev-only, active when no real S3
 * credentials are configured — see `S3Service`'s doc comment). Public: this is what the rating
 * page, review widget, and every other public consumer of a signed "S3" URL actually loads a
 * `<img src>`/download link from in local mode, exactly as they'd load a real S3 signed URL.
 */
@Controller()
export class LocalFilesController {
  constructor(private readonly s3: S3Service) {}

  @Public()
  @Get('local-files')
  async serve(@Query('key') key?: string): Promise<StreamableFile> {
    if (!key) throw new NotFoundException();
    const file = await this.s3.readLocalFile(key);
    if (!file) throw new NotFoundException();
    return new StreamableFile(file.buffer, { type: file.contentType });
  }
}
