import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCrewDto {
  @IsString()
  siteId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  foremanId?: string;

  @IsOptional()
  @IsString()
  shiftPattern?: string;
}
