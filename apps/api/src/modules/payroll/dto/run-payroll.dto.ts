import { IsISO8601 } from 'class-validator';

export class RunPayrollDto {
  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;
}
