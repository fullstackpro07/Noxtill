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
 * credentials are configured — see `S3Service`'s doc comment). The route is public for browser
 * embeds, but every request must carry an expiring HMAC capability like an S3 presigned URL; a raw
 * storage key is never sufficient to read a file.
 */
@Controller()
export class LocalFilesController {
  constructor(private readonly s3: S3Service) {}

  @Public()
  @Get('local-files')
  async serve(
    @Query('key') key: string | undefined,
    @Query('expires') expires: string | undefined,
    @Query('signature') signature: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (
      !key ||
      !this.s3.verifyLocalDownloadSignature(key, expires, signature)
    ) {
      throw new NotFoundException();
    }
    const file = await this.s3.readLocalFile(key);
    if (!file) throw new NotFoundException();
    // helmet's default Cross-Origin-Resource-Policy (same-origin) would otherwise block the
    // frontend (a different origin in dev) from embedding this in an <img>/<object> — a real S3
    // signed URL has no such restriction, so this route needs to behave the same way.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.buffer, { type: file.contentType });
  }
}
