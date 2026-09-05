import { IsBoolean, IsIn, IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export const WORK_TYPES = ['drilling', 'standby', 'travel', 'repair', 'training', 'weather_down'] as const;

export class CreateTimesheetDto {
  @IsString()
  employeeId!: string;

  @IsString()
  siteId!: string;

  @IsString()
  crewId!: string;

  @IsISO8601()
  workDate!: string;

  @IsIn(WORK_TYPES)
  workType!: string;

  @IsNumber()
  @Min(0)
  regularHours!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overtimeHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  nightHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  metersDrilled?: number;

  // Влияет на holidayAmount при расчёте ЗП — см. docs/payroll-formulas.md.
  @IsOptional()
  @IsBoolean()
  isHoliday?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  // Штамп времени с офлайн-устройства — см. docs/project-plan.md, раздел 6.
  @IsOptional()
  @IsISO8601()
  clientCreatedAt?: string;
}
