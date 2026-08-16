import { IsISO8601 } from 'class-validator';

export class SuggestAlternativeDto {
  @IsISO8601()
  startsAt!: string;
}
