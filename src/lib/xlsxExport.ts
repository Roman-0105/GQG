// ВАЖНО про безопасность: у пакета xlsx (SheetJS) с npm есть известные
// high-severity уязвимости (Prototype Pollution, ReDoS) без официального
// фикса в npm-версии — см. GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9.
// Обе связаны с ПАРСИНГОМ вредоносных .xlsx на вход. Мы используем
// библиотеку только для ЗАПИСИ (экспорт наших же данных) — XLSX.read()/
// parse нигде в проекте не вызывается, входных файлов от пользователя
// мы не читаем. Если в будущем понадобится ИМПОРТ xlsx-файлов — эту
// зависимость и риск нужно будет пересмотреть отдельно.
//
// Динамический import() — библиотека весит ~300 КБ и нужна только на
// одном экране в момент нажатия "Экспорт". Без lazy-load она бы грузилась
// при заходе на любую страницу сайта, что не годится для мобильной PWA.
export async function exportToXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | null)[][],
) {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, filename)
}
