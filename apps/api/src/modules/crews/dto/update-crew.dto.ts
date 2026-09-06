import { IsIn, IsOptional, IsString } from 'class-validator';
import { SHIFT_PATTERNS } from '../shift-patterns';

export class UpdateCrewDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  foremanId?: string | null;

  @IsOptional()
  @IsIn(SHIFT_PATTERNS)
  shiftPattern?: string;
}
