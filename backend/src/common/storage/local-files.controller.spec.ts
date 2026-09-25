import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { LocalFilesController } from './local-files.controller';
import type { S3Service } from './s3.service';

describe('LocalFilesController (dev-only local-disk fallback)', () => {
  const s3 = { readLocalFile: jest.fn() };
  const controller = new LocalFilesController(s3 as unknown as S3Service);
  const res = { setHeader: jest.fn() };
  const response = () => res as unknown as Response;

  afterEach(() => {
    s3.readLocalFile.mockClear();
    res.setHeader.mockClear();
  });

  it('streams back the real file bytes with the stored content type', async () => {
    s3.readLocalFile.mockResolvedValue({
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
    });

    const result = await controller.serve(
      'review-branding/biz-1/logo.png',
      response(),
    );

    expect(s3.readLocalFile).toHaveBeenCalledWith(
      'review-branding/biz-1/logo.png',
    );
    const chunks: Buffer[] = [];
    for await (const chunk of result.getStream()) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString()).toBe('hello');
  });

  it('allows cross-origin embedding, matching a real S3 signed URL', async () => {
    s3.readLocalFile.mockResolvedValue({
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
    });

    await controller.serve('review-branding/biz-1/logo.png', response());

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cross-Origin-Resource-Policy',
      'cross-origin',
    );
  });

  it('404s when the key was never written (or the file was deleted)', async () => {
    s3.readLocalFile.mockResolvedValue(null);
    await expect(
      controller.serve('never/written.png', response()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a request with no key at all, rather than reading the whole storage root', async () => {
    await expect(
      controller.serve(undefined, response()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(s3.readLocalFile).not.toHaveBeenCalled();
  });
});
