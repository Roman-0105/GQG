// Подсказка под списком выбора ответственных (03.10.2026): список показывает
// только людей нужного направления; если кого-то нет, их можно показать
// вручную. Если у фильтра вообще нет подходящих людей — объясняем, что делать.
interface Pick {
  candidates: unknown[]
  hidesSomeone: boolean
  showAll: boolean
  setShowAll: (v: boolean) => void
}

export default function AreaFilterHint({ pick, what }: { pick: Pick; what: string }) {
  if (pick.showAll) {
    return (
      <button
        type="button"
        onClick={() => pick.setShowAll(false)}
        style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--color-primary)', fontSize: 12, textAlign: 'left' }}
      >
        Показать только: {what}
      </button>
    )
  }
  if (!pick.hidesSomeone && pick.candidates.length > 0) return null
  return (
    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
      {pick.candidates.length === 0
        ? `Нет подходящих сотрудников: назначьте должность нужного направления (${what}) в «Пользователи → Управление должностями». `
        : `Показаны только: ${what}. `}
      <button
        type="button"
        onClick={() => pick.setShowAll(true)}
        style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--color-primary)', fontSize: 12 }}
      >
        Показать всех
      </button>
    </span>
  )
}
