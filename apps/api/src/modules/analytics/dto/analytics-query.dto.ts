import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export const GRAINS = ['day', 'week', 'month', 'quarter', 'year'] as const;

export class TimeseriesQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsIn(GRAINS)
  grain!: (typeof GRAINS)[number];

  @IsOptional()
  @IsString()
  siteId?: string;
}

export class TotalsQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsString()
  siteId?: string;
}
