import { Matches } from 'class-validator';

export class QueryTimesheetsDto {
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month!: string;
}
