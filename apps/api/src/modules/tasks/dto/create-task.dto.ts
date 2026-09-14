import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  siteId!: string;

  // Бригадир выбирается напрямую (не бригада) — участок и бригада
  // подставляются сами: бригада ищется как та, где этот пользователь
  // назначен foremanId на данном участке (см. TasksService.create).
  @IsString()
  foremanId!: string;

  @IsString()
  @IsNotEmpty()
  wellName!: string;

  @IsNumber()
  @Min(0)
  projectedDepth!: number;

  @IsNumber()
  @Min(0)
  dailyPlan!: number;

  @IsNumber()
  @Min(0)
  mountDismountPlanHours!: number;

  @IsOptional()
  @IsBoolean()
  hasNightShift?: boolean;
}
