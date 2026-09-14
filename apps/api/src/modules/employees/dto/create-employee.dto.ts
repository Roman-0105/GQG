import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  positionId!: string;

  @IsOptional()
  @IsString()
  crewId?: string;

  @IsOptional()
  @IsIn(['staff', 'contract', 'day_rate'])
  employmentType?: string;

  // hourly | per_meter — задаётся отдельно на каждого сотрудника
  // бригады (найдено при тестировании: часть бригады на почасовой,
  // часть — на метраже). См. Employee.payType в schema.prisma.
  @IsOptional()
  @IsIn(['hourly', 'per_meter'])
  payType?: string;
}
