import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { WORK_TYPES } from './create-timesheet.dto';

/**
 * Правка уже созданной строки табеля — до сегодняшнего дня такой
 * возможности не было вообще: ни отклонённую запись нельзя было
 * поправить перед повторной отправкой (только отправить те же самые
 * цифры заново), ни ошибку в черновике до отправки на согласование.
 * Разрешено только пока status='draft' или 'rejected' — см.
 * TimesheetsService.update.
 */
export class UpdateTimesheetDto {
  @IsOptional()
  @IsIn(WORK_TYPES)
  workType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  regularHours?: number;

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

  @IsOptional()
  @IsBoolean()
  isHoliday?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
