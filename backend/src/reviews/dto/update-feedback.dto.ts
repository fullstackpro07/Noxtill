import {
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateFeedbackDto {
  @IsOptional()
  @IsIn(['open', 'assigned', 'resolved'])
  status?: 'open' | 'assigned' | 'resolved';

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ValidateIf((o: UpdateFeedbackDto) => o.status === 'resolved')
  @IsString()
  @MinLength(5, {
    message: 'Resolving feedback requires a note of at least 5 characters',
  })
  resolutionNote?: string;
}
