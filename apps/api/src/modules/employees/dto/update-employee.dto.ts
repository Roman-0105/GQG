import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  // Смена должности сотрудника внутри бригады (найдено при тестировании
  // владельцем — раньше это было можно только при создании, без пути
  // назад для правки).
  @IsOptional()
  @IsString()
  positionId?: string;

  // Перевод в другую бригаду того же участка/компании — тем же полем,
  // что и при создании.
  @IsOptional()
  @IsString()
  crewId?: string;

  @IsOptional()
  @IsIn(['staff', 'contract', 'day_rate'])
  employmentType?: string;

  // hourly | per_meter — см. Employee.payType в schema.prisma.
  @IsOptional()
  @IsIn(['hourly', 'per_meter'])
  payType?: string;

  // Мягкое "удаление" из бригады (isActive=false) — см.
  // EmployeesService.remove для жёсткого удаления, когда это безопасно.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
