import { IsIn, IsOptional } from 'class-validator';

export class RecordBookingLinkVisitDto {
  @IsOptional()
  @IsIn(['link', 'qr'])
  source?: 'link' | 'qr';
}
