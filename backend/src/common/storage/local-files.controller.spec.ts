import { NotFoundException } from '@nestjs/common';
import { LocalFilesController } from './local-files.controller';
import type { S3Service } from './s3.service';

describe('LocalFilesController (dev-only local-disk fallback)', () => {
  const s3 = { readLocalFile: jest.fn() };
  const controller = new LocalFilesController(s3 as unknown as S3Service);

  afterEach(() => {
    s3.readLocalFile.mockClear();
  });

  it('streams back the real file bytes with the stored content type', async () => {
    s3.readLocalFile.mockResolvedValue({
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
    });

    const result = await controller.serve('review-branding/biz-1/logo.png');

    expect(s3.readLocalFile).toHaveBeenCalledWith(
      'review-branding/biz-1/logo.png',
    );
    const chunks: Buffer[] = [];
    for await (const chunk of result.getStream()) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString()).toBe('hello');
  });

  it('404s when the key was never written (or the file was deleted)', async () => {
    s3.readLocalFile.mockResolvedValue(null);
    await expect(controller.serve('never/written.png')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s a request with no key at all, rather than reading the whole storage root', async () => {
    await expect(controller.serve(undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(s3.readLocalFile).not.toHaveBeenCalled();
  });
});
