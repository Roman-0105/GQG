import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SHIFT_PATTERNS } from '../shift-patterns';

export class CreateCrewDto {
  @IsString()
  siteId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  foremanId?: string;

  @IsOptional()
  @IsIn(SHIFT_PATTERNS)
  shiftPattern?: string;
}
