import { IsString } from 'class-validator';

export class CreateCompetitorDto {
  /** A Google Place ID (or, until Places lookup is wired up, any stable reference the owner recognizes). */
  @IsString()
  platformRef!: string;
}
