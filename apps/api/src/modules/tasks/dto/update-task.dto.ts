import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  wellName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  projectedDepth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyPlan?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mountDismountPlanHours?: number;

  @IsOptional()
  @IsBoolean()
  hasNightShift?: boolean;
}
