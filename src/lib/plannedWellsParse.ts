// Разбор таблицы для массового планирования скважин (04.10.2026).
// Вход — текст: скопированный из Excel (колонки через табуляцию), CSV
// (разделитель «;» или «,») или содержимое первого листа .xlsx, которое
// страница заранее превращает в такой же текст (чтение .xlsx — через
// read-excel-file; библиотека xlsx для чтения НЕ используется, см.
// комментарий в xlsxExport.ts).
//
// Колонки по порядку: Номер скважины | Широта | Долгота | X | Y |
// Абс. отметка устья | Проектная глубина | Угол | Азимут | Описание.

export const PLAN_COLUMNS = [
  'Номер скважины',
  'Широта (WGS-84)',
  'Долгота (WGS-84)',
  'Местная X',
  'Местная Y',
  'Абс. отметка устья, м',
  'Проектная глубина, м',
  'Угол, °',
  'Азимут, °',
  'Описание',
] as const

export interface PlannedWellDraft {
  well_number: string
  coord_wgs84_lat: number
  coord_wgs84_lon: number
  coord_local_x: number
  coord_local_y: number
  wellhead_elevation: number
  projected_depth: number
  angle: number
  azimuth: number
  description: string
}

export interface ParsedRow {
  line: number
  cells: string[]
  draft: PlannedWellDraft | null
  errors: string[]
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  if (first.includes('\t')) return '\t'
  if (first.includes(';')) return ';'
  return ','
}

// Число с десятичной запятой или точкой; пустая строка и мусор -> NaN.
function toNumber(raw: string, decimalComma: boolean): number {
  let v = raw.trim().replace(/\s/g, '')
  if (v === '') return NaN
  if (decimalComma) v = v.replace(',', '.')
  return Number(v)
}

export function parsePlannedWells(text: string, existingNumbers: string[] = []): ParsedRow[] {
  const delimiter = detectDelimiter(text)
  // при разделителе «,» десятичной запятой быть не может
  const decimalComma = delimiter !== ','
  const lines = text.split(/\r?\n/)
  const taken = new Set(existingNumbers.map((n) => n.trim().toLowerCase()))
  const seen = new Set<string>()
  const out: ParsedRow[] = []

  lines.forEach((line, idx) => {
    if (line.trim() === '') return
    const cells = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''))
    // строка заголовка: во второй колонке не число
    if (out.length === 0 && Number.isNaN(toNumber(cells[1] ?? '', decimalComma)) && /[A-Za-zА-Яа-я]/.test(cells[1] ?? '')) return

    const errors: string[] = []
    const num = (i: number, label: string, min?: number, max?: number) => {
      const n = toNumber(cells[i] ?? '', decimalComma)
      if (Number.isNaN(n)) {
        errors.push(`${label}: не число`)
        return 0
      }
      if ((min != null && n < min) || (max != null && n > max)) errors.push(`${label}: вне диапазона`)
      return n
    }

    const wellNumber = (cells[0] ?? '').trim()
    if (!wellNumber) errors.push('Номер не указан')
    const key = wellNumber.toLowerCase()
    if (wellNumber && taken.has(key)) errors.push('Номер уже есть на участке')
    if (wellNumber && seen.has(key)) errors.push('Номер повторяется в списке')
    seen.add(key)

    const lat = num(1, 'Широта', -90, 90)
    const lon = num(2, 'Долгота', -180, 180)
    const x = num(3, 'X')
    const y = num(4, 'Y')
    const elevation = num(5, 'Отметка')
    const depth = num(6, 'Глубина', 0.01)
    const angle = num(7, 'Угол', -90, 90)
    const azimuth = num(8, 'Азимут', 0, 360)
    // описание может содержать разделитель — склеиваем хвост
    const description = cells.slice(9).join(delimiter === '\t' ? ' ' : delimiter).trim()
    if (!description) errors.push('Описание не указано')

    out.push({
      line: idx + 1,
      cells,
      errors,
      draft:
        errors.length === 0
          ? {
              well_number: wellNumber,
              coord_wgs84_lat: lat,
              coord_wgs84_lon: lon,
              coord_local_x: x,
              coord_local_y: y,
              wellhead_elevation: elevation,
              projected_depth: depth,
              angle,
              azimuth,
              description,
            }
          : null,
    })
  })
  return out
}
