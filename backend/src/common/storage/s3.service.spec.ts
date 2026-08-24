import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { S3Service } from './s3.service';

describe('S3Service — local-disk fallback (no real S3 credentials configured)', () => {
  let service: S3Service;
  let localRoot: string;
  let backendUrl: string;

  beforeAll(async () => {
    localRoot = await fs.mkdtemp(path.join(os.tmpdir(), 's3-fallback-test-'));
    backendUrl = 'http://localhost:5000/api/v1';
    const config = new ConfigService({
      LOCAL_STORAGE_ROOT: localRoot,
      BACKEND_URL: backendUrl,
      // Deliberately no S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY — this is the whole point of the test.
    });
    service = new S3Service(config);
  });

  afterAll(async () => {
    await fs.rm(localRoot, { recursive: true, force: true });
  });

  it('writes a real file to disk and reads it back with the right content type', async () => {
    const key = 'review-branding/biz-1/logo.png';
    await service.upload(key, Buffer.from('fake-png-bytes'), 'image/png');

    const onDisk = await fs.readFile(path.join(localRoot, key));
    expect(onDisk.toString()).toBe('fake-png-bytes');

    const read = await service.readLocalFile(key);
    expect(read).not.toBeNull();
    expect(read!.buffer.toString()).toBe('fake-png-bytes');
    expect(read!.contentType).toBe('image/png');
  });

  it('returns a local-files URL instead of a real signed S3 URL', async () => {
    const key = 'qr-posters/biz-1/a5-123.pdf';
    await service.upload(key, Buffer.from('pdf-bytes'), 'application/pdf');

    const url = await service.getSignedDownloadUrl(key);
    expect(url).toBe(`${backendUrl}/local-files?key=${encodeURIComponent(key)}`);
  });

  it('uploadAndSign writes the file and returns its local-files URL in one call', async () => {
    const key = 'video-testimonials/biz-1/clip.mp4';
    const url = await service.uploadAndSign(key, Buffer.from('mp4-bytes'), 'video/mp4');

    expect(url).toBe(`${backendUrl}/local-files?key=${encodeURIComponent(key)}`);
    const read = await service.readLocalFile(key);
    expect(read!.contentType).toBe('video/mp4');
  });

  it('readLocalFile returns null (never throws) for a key that was never written', async () => {
    const read = await service.readLocalFile('does/not/exist.png');
    expect(read).toBeNull();
  });

  it('delete removes both the file and its metadata sidecar', async () => {
    const key = 'review-branding/biz-1/to-delete.png';
    await service.upload(key, Buffer.from('x'), 'image/png');
    expect(await service.readLocalFile(key)).not.toBeNull();

    await service.delete(key);
    expect(await service.readLocalFile(key)).toBeNull();
    await expect(fs.access(path.join(localRoot, `${key}.meta.json`))).rejects.toThrow();
  });

  it('refuses a path-traversal key instead of writing outside the local storage root', async () => {
    await expect(
      service.upload('../../outside.png', Buffer.from('x'), 'image/png'),
    ).rejects.toThrow();
  });
});

describe('S3Service — real S3 mode when credentials are configured', () => {
  it('never falls back to local disk once real credentials are present', async () => {
    const config = new ConfigService({
      S3_ACCESS_KEY_ID: 'AKIA_TEST',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      S3_BUCKET: 'noxtill-dev',
    });
    const service = new S3Service(config);

    // In real-S3 mode, getSignedDownloadUrl builds a real presigned S3 URL (via the AWS SDK's own
    // local HMAC signing — no network call needed to produce the URL string itself), which is
    // never a `/local-files?key=` URL.
    const url = await service.getSignedDownloadUrl('some/key.png');
    expect(url).not.toContain('/local-files?key=');
    expect(url).toContain('noxtill-dev');
  });
});
