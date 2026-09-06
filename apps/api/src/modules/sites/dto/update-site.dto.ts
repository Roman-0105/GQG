import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Все поля необязательны — PATCH меняет только то, что прислали. */
export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['geology', 'geotech', 'drilling', 'mixed'])
  workType?: string;

  @IsOptional()
  @IsString()
  client?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;

  @IsOptional()
  @IsIn(['planned', 'active', 'paused', 'closed'])
  status?: string;
}
