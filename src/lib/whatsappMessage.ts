interface ShiftMessageInput {
  wellNumber: string
  rigNumber: string | null
  reportDate: string
  shiftNumber: number | null
  meters: number
  bottomHole: number
  shiftNotes: string | null
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
  if (shiftNotes && shiftNotes.trim()) lines.push('', shiftNotes.trim())
  return lines.join('\n')
}
