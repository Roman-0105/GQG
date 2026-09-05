import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRateRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  // null/не задано = действует на всю компанию (см. RateRule.siteId в schema.prisma)
  @IsOptional()
  @IsString()
  siteId?: string;

  // null/не задано = действует на все должности
  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  nightShiftPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  holidayPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  remoteBonusPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perDiemAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perMeterBonus?: number;

  // Чем выше — тем раньше применяется при пересечении правил
  // (см. docs/project-plan.md, раздел 4: компания -> участок -> должность).
  @IsOptional()
  @IsInt()
  priority?: number;
}
