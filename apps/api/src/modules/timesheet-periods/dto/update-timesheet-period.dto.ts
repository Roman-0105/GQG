import { IsISO8601, IsOptional, IsString } from 'class-validator';

// Правка дат/вида работ разрешена только пока период не отправлен на
// согласование (draft) или после отклонения (rejected) — см.
// TimesheetPeriodsService.update.
export class UpdateTimesheetPeriodDto {
  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @IsOptional()
  @IsISO8601()
  periodEnd?: string;

  @IsOptional()
  @IsString()
  workType?: string;
}
