import { IsOptional, IsString } from 'class-validator';

export class AssignCallDto {
  /** A `BusinessUser.id` to own the follow-up, or null/omitted to clear the assignment. */
  @IsOptional()
  @IsString()
  userId?: string | null;
}
