import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Причина обязательна — бригадир должен понимать, что исправлять
// перед повторной отправкой табеля за период.
export class RejectTimesheetPeriodDto {
  @IsString()
  @IsNotEmpty({ message: 'Укажите причину — иначе бригадир не поймёт, что исправлять' })
  @MaxLength(500)
  reason!: string;
}
