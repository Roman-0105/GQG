import { IsOptional, IsString, MaxLength } from 'class-validator';

// comment необязателен при первой отправке, но обязателен при повторной
// (после отклонения) — проверяется в сервисе, не декоратором, потому
// что зависит от текущего статуса периода.
export class SubmitTimesheetPeriodDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
