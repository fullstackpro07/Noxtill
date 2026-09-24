import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AddCallNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class TransferLiveCallDto {
  /** Overrides the business's own configured transfer number for this one transfer. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'must be an international phone number, e.g. +15551234567',
  })
  toNumber?: string;
}
