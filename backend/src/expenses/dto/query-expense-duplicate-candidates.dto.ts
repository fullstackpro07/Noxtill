import { IsString, Matches } from 'class-validator';

export class QueryExpenseDuplicateCandidatesDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be a valid YYYY-MM calendar month',
  })
  month!: string;
}
