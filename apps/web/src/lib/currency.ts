// Компания работает в Республике Казахстан — валюта везде тенге, а не
// рубли (найдено при тестировании владельцем компании). Единая точка
// правды вместо разбросанных по страницам "₽" и локальных функций
// форматирования (Analytics.tsx и Payroll.tsx раньше держали каждая
// свою копию с чуть разным числом знаков после запятой).
export const CURRENCY_SYMBOL = '₸';

export function formatMoney(v: string | number, decimals = 0): string {
  return Number(v).toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
