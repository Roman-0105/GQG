import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['geology', 'geotech', 'drilling', 'mixed'])
  workType!: string;

  @IsOptional()
  @IsString()
  client?: string;
}
