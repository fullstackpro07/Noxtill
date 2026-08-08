import { IsIn, IsString, IsUrl } from 'class-validator';

export class GenerateQrPosterDto {
  @IsIn(['a5', 'a4', 'sticker'])
  format!: 'a5' | 'a4' | 'sticker';

  @IsIn(['png', 'pdf'])
  fileType!: 'png' | 'pdf';

  // require_tld:false so http://localhost:3000/... still validates in dev.
  @IsUrl({ require_tld: false })
  @IsString()
  targetUrl!: string;
}
