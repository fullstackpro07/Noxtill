import { ArrayMinSize, ArrayMaxSize, IsArray, IsString } from 'class-validator';

/** UPD-FE-085's "bulk send with quota-check preview" — capped well below any realistic quota so a single bad click can't exhaust a month's budget. */
export class BulkCreateReviewRequestsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  customerIds!: string[];

  @IsString()
  source!: string;
}
