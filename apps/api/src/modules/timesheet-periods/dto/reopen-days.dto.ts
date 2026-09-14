import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * "Редактировать график" — бригадир возвращает уже отправленные/
 * согласованные (но не заблокированные) дни на правку, например,
 * потому что забыл заполнить смену за кого-то из бригады и заметил
 * это позже. Обязательный комментарий — не тихая правка задним числом,
 * а прослеживаемое исправление (см. Timesheet.correctionReason).
 */
export class ReopenDaysDto {
  @IsISO8601()
  fromDate!: string;

  @IsISO8601()
  toDate!: string;

  @IsString()
  @IsNotEmpty({ message: 'Укажите причину правки — иначе согласующий не поймёт, что изменилось' })
  @MaxLength(500)
  reason!: string;

  // Необязательно — если не указан, переоткрываются дни для ВСЕХ
  // сотрудников этого табеля в выбранном диапазоне.
  @IsOptional()
  @IsString()
  employeeId?: string;
}
