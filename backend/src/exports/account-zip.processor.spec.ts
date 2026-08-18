// `archiver` (v8) ships ESM-only and breaks ts-jest's per-file CommonJS transform — same class of
// issue already worked around for puppeteer in qr-poster.service.spec.ts. Mocked with a minimal
// real-stream-backed fake so `AccountZipProcessor`'s own append/finalize/notification logic is
// still exercised for real; only archiver's actual ZIP compression is faked out.
import { PassThrough } from 'stream';

jest.mock('archiver', () => {
  class MockZipArchive {
    private dest: PassThrough | undefined;
    entries: { name: string; buffer: Buffer }[] = [];

    pipe(dest: PassThrough) {
      this.dest = dest;
      return dest;
    }

    append(buffer: Buffer, meta: { name: string }) {
      this.entries.push({ name: meta.name, buffer });
      this.dest?.write(buffer);
      return this;
    }

    on() {
      return this;
    }

    finalize() {
      this.dest?.end();
      return Promise.resolve();
    }
  }

  return { ZipArchive: MockZipArchive };
});

import { AccountZipProcessor } from './account-zip.processor';
import type { ExportsService } from './exports.service';
import type { S3Service } from '../common/storage/s3.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { EXPORT_KINDS } from './exports.constants';

describe('AccountZipProcessor (INT-012)', () => {
  const exportsService = {
    buildXlsxBuffer: jest.fn((_businessId: string, kind: string) =>
      Promise.resolve(Buffer.from(`fake-xlsx-bytes-${kind}`)),
    ),
  };
  const s3 = {
    uploadAndSign: jest
      .fn()
      .mockResolvedValue('https://signed.example/account.zip'),
  };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };

  let processor: AccountZipProcessor;

  beforeEach(() => {
    processor = new AccountZipProcessor(
      exportsService as unknown as ExportsService,
      s3 as unknown as S3Service,
      notifications as unknown as NotificationsService,
    );
    exportsService.buildXlsxBuffer.mockClear();
    s3.uploadAndSign.mockClear();
    notifications.create.mockClear();
  });

  it('builds one xlsx sheet per export kind, assembles a zip archive, and notifies the requesting user', async () => {
    await processor.process({
      data: { businessId: 'biz-1', userId: 'user-1' },
    } as never);

    expect(exportsService.buildXlsxBuffer).toHaveBeenCalledTimes(
      EXPORT_KINDS.length,
    );
    for (const kind of EXPORT_KINDS) {
      expect(exportsService.buildXlsxBuffer).toHaveBeenCalledWith(
        'biz-1',
        kind,
      );
    }

    expect(s3.uploadAndSign).toHaveBeenCalledTimes(1);
    const [key, zipBuffer, contentType] = s3.uploadAndSign.mock.calls[0] as [
      string,
      Buffer,
      string,
    ];
    expect(key).toContain('exports/biz-1/account-');
    expect(contentType).toBe('application/zip');
    // Every kind's fake xlsx bytes must have made it into the assembled archive stream.
    for (const kind of EXPORT_KINDS) {
      expect(zipBuffer.toString()).toContain(`fake-xlsx-bytes-${kind}`);
    }

    expect(notifications.create).toHaveBeenCalledWith(
      'biz-1',
      'user-1',
      expect.objectContaining({
        title: 'Export ready',
        link: 'https://signed.example/account.zip',
      }),
    );
  });
});
