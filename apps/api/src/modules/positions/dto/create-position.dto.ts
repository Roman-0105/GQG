import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePositionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  baseHourlyRate!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  overtimeMultiplier?: number;

  @IsOptional()
  @IsBoolean()
  hazardPay?: boolean;
}
