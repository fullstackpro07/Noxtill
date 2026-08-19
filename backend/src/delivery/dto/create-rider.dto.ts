import { IsString } from 'class-validator';

export class CreateRiderDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;
}
