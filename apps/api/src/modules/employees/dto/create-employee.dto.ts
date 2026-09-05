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
}
