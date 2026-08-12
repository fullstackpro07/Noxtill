import { IsIn } from 'class-validator';

export class UpdateInsightStatusDto {
  @IsIn(['actioned', 'dismissed'])
  status!: 'actioned' | 'dismissed';
}
