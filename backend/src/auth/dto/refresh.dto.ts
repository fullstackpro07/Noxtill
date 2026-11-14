import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Browsers send the refresh token in the HttpOnly cookie; non-browser clients may send it here. */
export class RefreshDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}
