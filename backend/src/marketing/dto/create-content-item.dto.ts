import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';
import {
  ContentItemChannel,
  ContentItemStatus,
  ContentItemType,
} from '@prisma/client';

const TYPES: ContentItemType[] = [
  'social_post',
  'story',
  'reel',
  'email',
  'sms',
  'whatsapp',
  'article',
];
const CHANNELS: ContentItemChannel[] = [
  'instagram',
  'facebook',
  'email',
  'whatsapp',
  'sms',
];
const STATUSES: ContentItemStatus[] = [
  'draft',
  'needs_approval',
  'scheduled',
  'published',
  'failed',
];

export class CreateContentItemDto {
  @IsString()
  title!: string;

  @IsIn(TYPES)
  type!: ContentItemType;

  @IsIn(CHANNELS)
  channel!: ContentItemChannel;

  @IsString()
  body!: string;

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;
}

export class UpdateContentItemDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(TYPES)
  type?: ContentItemType;

  @IsOptional()
  @IsIn(CHANNELS)
  channel?: ContentItemChannel;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: ContentItemStatus;

  @IsOptional()
  @IsString()
  ownerUserId?: string;
}
