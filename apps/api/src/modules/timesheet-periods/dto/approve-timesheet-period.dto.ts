import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveTimesheetPeriodDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
