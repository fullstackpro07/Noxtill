import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { LocalFilesController } from './local-files.controller';
import type { S3Service } from './s3.service';

describe('LocalFilesController (dev-only local-disk fallback)', () => {
  const s3 = {
    readLocalFile: jest.fn(),
    verifyLocalDownloadSignature: jest.fn().mockReturnValue(true),
  };
  const controller = new LocalFilesController(s3 as unknown as S3Service);
  const res = { setHeader: jest.fn() };
  const response = () => res as unknown as Response;

  afterEach(() => {
    s3.readLocalFile.mockClear();
    s3.verifyLocalDownloadSignature.mockClear();
    s3.verifyLocalDownloadSignature.mockReturnValue(true);
    res.setHeader.mockClear();
  });

  it('streams back the real file bytes with the stored content type', async () => {
    s3.readLocalFile.mockResolvedValue({
      buffer: Buffer.from('hello'),
      contentType: 'image/png',
    });

    const result = await controller.serve(
      'review-branding/biz-1/logo.png',
      '1800000000',
      'a'.repeat(64),
      response(),
    );

    expect(s3.readLocalFile).toHaveBeenCalledWith(
      'review-branding/biz-1/logo.png',
    );
    expect(s3.verifyLocalDownloadSignature).toHaveBeenCalledWith(
      'review-branding/biz-1/logo.png',
      '1800000000',
      'a'.repeat(64),
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

    await controller.serve(
      'review-branding/biz-1/logo.png',
      '1800000000',
      'a'.repeat(64),
      response(),
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      'Cross-Origin-Resource-Policy',
      'cross-origin',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Referrer-Policy',
      'no-referrer',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
  });

  it('404s when the key was never written (or the file was deleted)', async () => {
    s3.readLocalFile.mockResolvedValue(null);
    await expect(
      controller.serve(
        'never/written.png',
        '1800000000',
        'a'.repeat(64),
        response(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s a request with no key at all, rather than reading the whole storage root', async () => {
    await expect(
      controller.serve(undefined, undefined, undefined, response()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(s3.readLocalFile).not.toHaveBeenCalled();
  });

  it('does not read a key when the capability signature is invalid', async () => {
    s3.verifyLocalDownloadSignature.mockReturnValue(false);
    await expect(
      controller.serve(
        'voice-recordings/biz-1/call.mp3',
        '1800000000',
        'bad',
        response(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(s3.readLocalFile).not.toHaveBeenCalled();
  });
});
