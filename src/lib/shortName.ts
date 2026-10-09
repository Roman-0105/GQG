// Сокращённое ФИО для списков и подписей (09.10.2026): полностью только
// фамилия, дальше инициалы — «Пономарев Иван Сергеевич» → «Пономарев И. С.».
// В формах правки ФИО остаётся полным.
export function shortName(full: string | null | undefined): string {
  if (!full) return ''
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? ''
  const initials = parts
    .slice(1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(' ')
  return `${parts[0]} ${initials}`
}
