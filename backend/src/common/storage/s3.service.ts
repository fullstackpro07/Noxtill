import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

/**
 * All generated files (invoices, statements, exports, reports) go through
 * here (BE-012 / spec §1: "Files: all generated files → S3 → signed URLs
 * expiring 24h. Nothing public except the review widget and public pages.").
 */
@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET', 'noxtill-dev');
    this.client = new S3Client({
      region: this.config.get<string>('S3_REGION', 'us-east-1'),
      endpoint: this.config.get<string>('S3_ENDPOINT') || undefined,
      forcePathStyle: this.config.get<string>('S3_FORCE_PATH_STYLE') === 'true',
      credentials:
        this.config.get<string>('S3_ACCESS_KEY_ID') &&
        this.config.get<string>('S3_SECRET_ACCESS_KEY')
          ? {
              accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID')!,
              secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY')!,
            }
          : undefined,
    });
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Signed GET URL, expiring in 24h by default per the files rule. */
  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds: number = SIGNED_URL_TTL_SECONDS,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
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
}
