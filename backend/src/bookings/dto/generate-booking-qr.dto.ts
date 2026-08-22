import { IsIn } from 'class-validator';

/** Mirrors ReviewsModule's GenerateQrPosterDto shape (UPD-BE-090) — the target URL is always this
 * business's own real public booking page, computed server-side, never client-supplied. */
export class GenerateBookingQrDto {
  @IsIn(['a5', 'a4', 'sticker'])
  format!: 'a5' | 'a4' | 'sticker';

  @IsIn(['png', 'pdf'])
  fileType!: 'png' | 'pdf';
}
