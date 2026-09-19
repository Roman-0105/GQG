interface AttachedCoreDescriptionInfo {
  label: string
  from: number
  to: number
  photoFrom: number | null
  photoTo: number | null
}

interface ShiftMessageInput {
  wellNumber: string
  rigNumber: string | null
  reportDate: string
  shiftNumber: number | null
  meters: number
  bottomHole: number
  shiftNotes: string | null
  // Метрики доп. работ, прицепленных к скважине (см. отзыв 19.09.2026) —
  // печатаются доп. строками, ТОЛЬКО если работа прицеплена и в сводке
  // по ней реально что-то введено. Базовый формат (без вложений) не
  // меняется ни на символ — он подогнан 1:1 под реальный отчёт заказчика.
  coreDescriptions?: AttachedCoreDescriptionInfo[]
  sawnMeters?: number | null
  samplesTaken?: number | null
  samplesSubmitted?: number | null
}

function formatDateRu(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

// Текст сообщения для рабочего чата (WhatsApp) — подогнан под реальный
// шаблон внутреннего отчёта заказчика (см. пример от 17.09.2026), не
// придуман с нуля. Один источник для формы ввода (DailyReportForm) и
// просмотра истории (ReportDetail), чтобы формат не расходился.
export function buildDrillingShiftMessage({
  wellNumber,
  rigNumber,
  reportDate,
  shiftNumber,
  meters,
  bottomHole,
  shiftNotes,
  coreDescriptions,
  sawnMeters,
  samplesTaken,
  samplesSubmitted,
}: ShiftMessageInput): string {
  const lines = [`Отчёт по бурению ${formatDateRu(reportDate)}`]
  if (shiftNumber) lines.push(`Смена ${shiftNumber}`)
  lines.push(
    '',
    `Скважина: ${wellNumber}`,
    `Буровая установка: ${rigNumber ?? '—'}`,
    `Глубина: ${bottomHole}`,
    `Проходка: ${meters}`,
  )
  for (const core of coreDescriptions ?? []) {
    lines.push(`Керн (${core.label}): ${core.from}–${core.to}`)
    if (core.photoTo != null) {
      lines.push(`Фотофиксация (${core.label}): ${core.photoFrom ?? 0}–${core.photoTo}`)
    }
  }
  if (sawnMeters != null) lines.push(`Распилено: ${sawnMeters}`)
  if (samplesTaken != null || samplesSubmitted != null) {
    lines.push(
      `Проб отобрано: ${samplesTaken ?? 0}${samplesSubmitted != null ? `, сдано: ${samplesSubmitted}` : ''}`,
    )
  }
  if (shiftNotes && shiftNotes.trim()) lines.push('', shiftNotes.trim())
  return lines.join('\n')
}
