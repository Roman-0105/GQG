import { Type } from 'class-transformer';
import { IsArray, IsISO8601, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

export class EmployeeAdjustmentDto {
  @IsString()
  employeeId!: string;

  @IsNumber()
  amount!: number;
}

export class RunPayrollDto {
  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;

  // Аванс не хранится в БД (в схеме нет модели "Аванс" — см.
  // docs/payroll-formulas.md, D9) — вводится вручную при каждом
  // запуске расчёта, по сотрудникам.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeAdjustmentDto)
  advances?: EmployeeAdjustmentDto[];

  // Прочие удержания (налог и т.п.) — вне формулы расчёта, тоже ручной
  // ввод (docs/payroll-formulas.md, D8).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeAdjustmentDto)
  deductions?: EmployeeAdjustmentDto[];
}
