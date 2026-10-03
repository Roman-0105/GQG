// Текст «сводки геологов за день» для рабочей группы WhatsApp — по образцу
// сообщения старшего геолога (02.10.2026):
//
//   Добрый вечер сводка за 02.10.2026
//
//   ZKY11301
//   69.5м геотехнической документации общий метраж 599.5м документация закончилась ...
//
//   Распиловка
//   Ночь-75.1м ZKY11501
//   День -8.6м ZKY11501
//               30.7м ZKY11301
//   И того: 114.4м
//
//   Фото документация
//   ZKY11501
//
//   Отбор проб
//   ZKY11501 - 29 проб

export interface GeologyDocLine {
  kind: 'geological' | 'geotechnical'
  meters: number
  total: number
  finished: boolean
  photoDone: boolean
}

export interface GeologySawLine {
  shift: 1 | 2 // 1 = День, 2 = Ночь
  meters: number
}

export interface GeologySampleLine {
  typeName: string
  quantity: number
}

export interface GeologyWellBlock {
  wellLabel: string
  docs: GeologyDocLine[]
  saw: GeologySawLine[]
  samples: GeologySampleLine[]
  layoutDone: boolean
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function fmt(n: number) {
  return String(round2(n))
}

function formatDateRu(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function pluralProb(n: number) {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return 'проб'
  if (mod10 === 1) return 'проба'
  if (mod10 >= 2 && mod10 <= 4) return 'пробы'
  return 'проб'
}

function greeting(hour: number) {
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

const KIND_LABEL: Record<GeologyDocLine['kind'], string> = {
  geological: 'геологической',
  geotechnical: 'геотехнической',
}

export function buildGeologyDayMessage({
  date,
  wells,
  hour = new Date().getHours(),
}: {
  date: string
  wells: GeologyWellBlock[]
  hour?: number
}) {
  const lines: string[] = [`${greeting(hour)} сводка за ${formatDateRu(date)}`]

  // 1. Блоки по скважинам: документация и отбор проб
  for (const w of wells) {
    const parts: string[] = []
    for (const d of w.docs) {
      if (d.meters > 0 || d.finished) {
        let part = `${fmt(d.meters)}м ${KIND_LABEL[d.kind]} документации общий метраж ${fmt(d.total)}м`
        if (d.finished) part += ' документация закончилась'
        parts.push(part)
      }
    }
    const sampleTotal = w.samples.reduce((s, x) => s + x.quantity, 0)
    if (w.layoutDone) parts.push('разбивка на опробование')
    if (sampleTotal > 0) {
      const names = Array.from(new Set(w.samples.filter((s) => s.quantity > 0).map((s) => s.typeName.toLowerCase())))
      parts.push(`отбор проб на ${names.join(', ')}`)
    }
    if (parts.length > 0) {
      lines.push('', w.wellLabel, parts.join(' '))
    }
  }

  // 2. Распиловка: сначала «Ночь», потом «День», внутри смены — по скважинам
  const sawByShift = (shift: 1 | 2) =>
    wells
      .map((w) => ({ label: w.wellLabel, meters: w.saw.filter((s) => s.shift === shift).reduce((a, s) => a + s.meters, 0) }))
      .filter((x) => x.meters > 0)
  const night = sawByShift(2)
  const day = sawByShift(1)
  if (night.length > 0 || day.length > 0) {
    lines.push('', 'Распиловка')
    let total = 0
    const emit = (title: string, rows: { label: string; meters: number }[]) => {
      rows.forEach((r, i) => {
        total += r.meters
        if (i === 0) lines.push(`${title}-${fmt(r.meters)}м ${r.label}`)
        else lines.push(`${' '.repeat(title.length + 1)}${fmt(r.meters)}м ${r.label}`)
      })
    }
    emit('Ночь', night)
    emit('День', day)
    lines.push(`И того: ${fmt(total)}м`)
  }

  // 3. Фото-документация: скважины, по которым отмечена фотофиксация
  const photoWells = wells.filter((w) => w.docs.some((d) => d.photoDone))
  if (photoWells.length > 0) {
    lines.push('', 'Фото документация')
    for (const w of photoWells) lines.push(w.wellLabel)
  }

  // 4. Отбор проб: по скважинам, с итогом
  const sampleWells = wells
    .map((w) => ({ label: w.wellLabel, total: w.samples.reduce((s, x) => s + x.quantity, 0) }))
    .filter((x) => x.total > 0)
  if (sampleWells.length > 0) {
    lines.push('', 'Отбор проб')
    for (const w of sampleWells) lines.push(`${w.label} - ${w.total} ${pluralProb(w.total)}`)
  }

  return lines.join('\n')
}
