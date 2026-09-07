import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Причина возврата табеля на исправление (docs/project-plan.md,
 * раздел 4: "возврат на исправление с комментарием"). Обязательна —
 * без неё бригадир получал отклонённый табель без единого слова
 * объяснения и без возможности понять, что исправлять (найдено
 * docs-writer при подготовке инструкций к Этапу 06).
 */
export class RejectTimesheetDto {
  @IsString()
  @IsNotEmpty({ message: 'Укажите причину возврата — иначе бригадир не поймёт, что исправлять' })
  @MaxLength(500)
  reason!: string;
}
