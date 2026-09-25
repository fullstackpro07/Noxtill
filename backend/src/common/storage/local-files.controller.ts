import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
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
  async serve(
    @Query('key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!key) throw new NotFoundException();
    const file = await this.s3.readLocalFile(key);
    if (!file) throw new NotFoundException();
    // helmet's default Cross-Origin-Resource-Policy (same-origin) would otherwise block the
    // frontend (a different origin in dev) from embedding this in an <img>/<object> — a real S3
    // signed URL has no such restriction, so this route needs to behave the same way.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return new StreamableFile(file.buffer, { type: file.contentType });
  }
}
