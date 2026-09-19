// Единый список видов заданий и вспомогательные функции — раньше
// `type TaskType = 'drilling' | 'core-description'` был продублирован
// в 4+ файлах, при добавлении распиловки/опробования (см. миграцию 0007)
// свёл в одно место, чтобы больше не расходилось.
export type TaskType = 'drilling' | 'core-description' | 'core-sawing' | 'sampling'

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  drilling: 'Бурение',
  'core-description': 'Описание керна',
  'core-sawing': 'Распиловка керна',
  sampling: 'Опробование',
}

// Колонка-FK в таблице reports, которую заполняет сводка этого вида задания.
export const TASK_TYPE_REPORT_COLUMN = {
  drilling: 'drilling_task_id',
  'core-description': 'core_description_task_id',
  'core-sawing': 'core_sawing_task_id',
  sampling: 'sampling_task_id',
} as const satisfies Record<TaskType, string>
