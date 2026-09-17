import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { MessageChannel } from '@prisma/client';

export class CreateReviewRequestDto {
  @ValidateIf((o: CreateReviewRequestDto) => !o.phone)
  @IsString()
  customerId?: string;

  @ValidateIf((o: CreateReviewRequestDto) => !o.customerId)
  @IsString()
  phone?: string;

  @IsString()
  source!: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  /** Overrides the normal channel-priority resolution — the customer picks a specific channel on the "Send Request" dialog rather than always getting whichever channel resolves first. */
  @IsOptional()
  @IsEnum(MessageChannel)
  channel?: MessageChannel;
}
