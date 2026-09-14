import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';

class ShiftAssignmentEntry {
  @IsString()
  employeeId!: string;

  @IsIn(['day', 'night'])
  shift!: 'day' | 'night';
}

// Один запрос заменяет распределение целиком — бригадир расставляет
// всю бригаду по сменам сразу, частичного PATCH по одному человеку не
// нужно (см. TasksService.setShiftAssignments).
export class SetShiftAssignmentsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ShiftAssignmentEntry)
  assignments!: ShiftAssignmentEntry[];
}
