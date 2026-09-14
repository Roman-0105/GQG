import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateTimesheetPeriodDto {
  @IsString()
  crewId!: string;

  // Необязательно — из карточки задания подставляется само (см.
  // MyTasks.tsx), при создании напрямую из "Моя бригада" может
  // отсутствовать (бригады без заданий).
  @IsOptional()
  @IsString()
  taskId?: string;

  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;

  // Один вид работ на весь период — см. комментарий у модели
  // TimesheetPeriod в schema.prisma. По умолчанию 'drilling', как и
  // у одиночных записей табеля.
  @IsOptional()
  @IsString()
  workType?: string;
}
