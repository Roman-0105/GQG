import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  // Плановый бюджет участка — сравнивается с фактическими затратами на
  // ЗП в аналитике (docs/project-plan.md, раздел 5).
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;
}
