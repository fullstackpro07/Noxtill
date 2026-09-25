import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

interface LocalFile {
  buffer: Buffer;
  contentType: string;
}

/**
 * All generated files (invoices, statements, exports, reports) go through
 * here (BE-012 / spec §1: "Files: all generated files → S3 → signed URLs
 * expiring 24h. Nothing public except the review widget and public pages.").
 *
 * Local-disk fallback: when no real `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` are configured
 * (e.g. a fresh dev checkout with no AWS account set up), every method here transparently writes
 * to/reads from local disk instead, served back through `LocalFilesController`
 * (`GET local-files?key=`). Every one of this app's ~15 upload call sites goes through this one
 * class, so they all get the fallback for free — nothing else needed to change. This path is
 * dev-only by construction (real S3 credentials always win when present) and never signs a real
 * S3 URL, so it can never be mistaken for production behavior.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client | null = null;
  private readonly bucket: string;
  private readonly useLocalStorage: boolean;
  private readonly localRoot: string;
  private readonly backendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET', 'noxtill-dev');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    this.useLocalStorage = !accessKeyId || !secretAccessKey;

    this.localRoot = path.resolve(
      this.config.get<string>('LOCAL_STORAGE_ROOT') ??
        path.join(process.cwd(), 'local-storage'),
    );
    this.backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';

    if (this.useLocalStorage) {
      this.logger.warn(
        `No S3 credentials configured — falling back to local disk storage at ${this.localRoot}. ` +
          'This is a dev-only convenience; set S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY for real S3 (or an S3-compatible service like MinIO) before deploying.',
      );
    } else {
      this.client = new S3Client({
        region: this.config.get<string>('S3_REGION', 'us-east-1'),
        endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
        forcePathStyle:
          this.config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
        credentials: {
          accessKeyId: accessKeyId!,
          secretAccessKey: secretAccessKey!,
        },
      });
    }
  }

  /** Whether files are kept on this server's disk (development) or in S3-compatible object storage. */
  storageMode(): 'local' | 's3' {
    return this.useLocalStorage ? 'local' : 's3';
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.useLocalStorage) {
      await this.localWrite(key, body, contentType);
      return;
    }
    await this.client!.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Signed GET URL, expiring in 24h by default per the files rule. In local mode this is a plain
   * (unsigned) URL to `LocalFilesController` — there's nothing to sign against a filesystem, and
   * this path is never reachable in production since real credentials always take priority. */
  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds: number = SIGNED_URL_TTL_SECONDS,
  ): Promise<string> {
    if (this.useLocalStorage) {
      return `${this.backendUrl}/local-files?key=${encodeURIComponent(key)}`;
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client!, command, { expiresIn: expiresInSeconds });
  }

  /** Convenience: upload then immediately return a 24h signed URL to it. */
  async uploadAndSign(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.upload(key, body, contentType);
    return this.getSignedDownloadUrl(key);
  }

  /**
   * Bytes stored under this business's own folder in each top-level area (`exports/<id>/…`,
   * `media/<id>/…`, …), which is how nearly every upload is keyed. Files stored outside that layout
   * are not counted, and a very large folder stops being walked at MAX_LISTED objects (`truncated`).
   */
  async usageForBusiness(businessId: string): Promise<{
    bytes: number;
    objects: number;
    truncated: boolean;
    areas: { area: string; bytes: number; objects: number }[];
  }> {
    const MAX_LISTED = 20_000;
    const areas: { area: string; bytes: number; objects: number }[] = [];
    let truncated = false;
    let listed = 0;

    if (this.useLocalStorage) {
      const walk = async (
        dir: string,
      ): Promise<{ bytes: number; objects: number }> => {
        let bytes = 0;
        let objects = 0;
        for (const entry of await fs
          .readdir(dir, { withFileTypes: true })
          .catch(() => [])) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const sub = await walk(full);
            bytes += sub.bytes;
            objects += sub.objects;
          } else if (!entry.name.endsWith('.meta.json')) {
            bytes += (await fs.stat(full)).size;
            objects += 1;
          }
        }
        return { bytes, objects };
      };
      for (const top of await fs
        .readdir(this.localRoot, { withFileTypes: true })
        .catch(() => [])) {
        if (!top.isDirectory()) continue;
        const dir = path.join(this.localRoot, top.name, businessId);
        const used = await walk(dir);
        if (used.objects > 0) areas.push({ area: top.name, ...used });
      }
    } else {
      const roots = await this.client!.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Delimiter: '/' }),
      );
      for (const prefix of roots.CommonPrefixes ?? []) {
        if (!prefix.Prefix) continue;
        let bytes = 0;
        let objects = 0;
        let token: string | undefined;
        do {
          const page = await this.client!.send(
            new ListObjectsV2Command({
              Bucket: this.bucket,
              Prefix: `${prefix.Prefix}${businessId}/`,
              ContinuationToken: token,
            }),
          );
          for (const o of page.Contents ?? []) {
            bytes += o.Size ?? 0;
            objects += 1;
          }
          listed += page.Contents?.length ?? 0;
          token =
            page.IsTruncated && listed < MAX_LISTED
              ? page.NextContinuationToken
              : undefined;
          if (page.IsTruncated && listed >= MAX_LISTED) truncated = true;
        } while (token);
        if (objects > 0)
          areas.push({
            area: prefix.Prefix.replace(/\/$/, ''),
            bytes,
            objects,
          });
      }
    }

    areas.sort((a, b) => b.bytes - a.bytes);
    return {
      bytes: areas.reduce((n, a) => n + a.bytes, 0),
      objects: areas.reduce((n, a) => n + a.objects, 0),
      truncated,
      areas,
    };
  }

  /** Used by retention/purge jobs (e.g. UPD-BE-059's voice recording retention) — permanent, not a soft-delete. */
  async delete(key: string): Promise<void> {
    if (this.useLocalStorage) {
      await this.localDelete(key);
      return;
    }
    await this.client!.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /** Reads a stored object's bytes back in either storage mode. Returns null (never throws) when the key is missing. */
  async readObject(key: string): Promise<Buffer | null> {
    if (this.useLocalStorage) {
      return (await this.readLocalFile(key))?.buffer ?? null;
    }
    try {
      const out = await this.client!.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await out.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  /** Read-back for `LocalFilesController`. Returns null (never throws) for a missing key or when
   * running in real-S3 mode, so the controller can turn either case into a clean 404. */
  async readLocalFile(key: string): Promise<LocalFile | null> {
    if (!this.useLocalStorage) return null;
    try {
      const filePath = this.resolveLocalPath(key);
      const [buffer, metaRaw] = await Promise.all([
        fs.readFile(filePath),
        fs.readFile(this.metaPath(filePath), 'utf8').catch(() => null),
      ]);
      const contentType = metaRaw
        ? ((JSON.parse(metaRaw) as { contentType?: string }).contentType ??
          'application/octet-stream')
        : 'application/octet-stream';
      return { buffer, contentType };
    } catch {
      return null;
    }
  }

  private async localWrite(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const filePath = this.resolveLocalPath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body);
    await fs.writeFile(
      this.metaPath(filePath),
      JSON.stringify({ contentType }),
    );
  }

  private async localDelete(key: string): Promise<void> {
    const filePath = this.resolveLocalPath(key);
    await fs.rm(filePath, { force: true });
    await fs.rm(this.metaPath(filePath), { force: true });
  }

  private metaPath(filePath: string): string {
    return `${filePath}.meta.json`;
  }

  /** Every real key is built by this app itself (never taken raw from a request), but this route
   * is served publicly, so it's still resolved defensively: normalized and required to stay inside
   * `localRoot`, rejecting any `..` traversal attempt outright. */
  private resolveLocalPath(key: string): string {
    const resolved = path.resolve(this.localRoot, key);
    if (
      resolved !== this.localRoot &&
      !resolved.startsWith(this.localRoot + path.sep)
    ) {
      throw new BadRequestException('Invalid file key');
    }
    return resolved;
  }
}
