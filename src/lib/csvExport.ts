// Простая выгрузка "таблица данных" (см. ТЗ: экспорт сложнее — фирменный
// шаблон и т.п. — откладывается на будущее). CSV открывается в Excel
// и любой таблице без доп. библиотек на фронтенде.
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][],
) {
  const escape = (value: string | number | null) => {
    const str = value == null ? '' : String(value)
    // Экранирование по правилам CSV: если есть запятая/кавычка/перенос
    // строки — оборачиваем в кавычки и удваиваем внутренние кавычки.
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [headers, ...rows].map((row) => row.map(escape).join(','))
  // BOM в начале — чтобы Excel на Windows правильно определил UTF-8
  // и не показал кракозябры вместо кириллицы.
  const csvContent = '\uFEFF' + lines.join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
