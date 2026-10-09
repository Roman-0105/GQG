import { ROLE_LABELS } from '../types/roles'
import type { Position, Profile, Worker } from '../types/database'
import { SUPERVISOR_LEVELS, levelOfPosition } from '../lib/accessLevels'
import { profileValue, workerValue } from '../lib/personRef'
import { shortName } from '../lib/shortName'

// Select "Пользователь/Работник" с группировкой по optgroup — используется
// и для "Должность держит..."-подобных полей, и как select "Руководитель"
// в Пользователях/Работниках/Оргструктуре (25.09.2026, вынесено из
// OrgChart.tsx при переходе оргструктуры на person-centric модель, чтобы
// не дублировать разметку в 3 местах). Архивные работники исключаются из
// выбора НОВОГО значения, но продолжают отображаться, если уже выбраны
// (та же логика, что раньше была локально в OrgChart.tsx) — иначе история
// молча "обезличилась" бы.
export default function PersonSelect({
  profiles,
  workers,
  value,
  onChange,
  excludeKeys,
  noneLabel = '— не выбран —',
  disabled,
  positions,
  forLevel,
}: {
  profiles: Profile[]
  workers: Worker[]
  value: string
  onChange: (value: string) => void
  excludeKeys?: Set<string>
  noneLabel?: string
  disabled?: boolean
  // Подчинение: допустимые уровни руководителя задаёт SUPERVISOR_LEVELS.
  positions?: Position[]
  forLevel?: number
}) {
  const allowedLevels = forLevel != null ? SUPERVISOR_LEVELS[forLevel] ?? [] : null
  const fits = (positionId: string | null, key: string) =>
    allowedLevels == null || !positions || key === value || allowedLevels.includes(levelOfPosition(positions, positionId))
  const visibleProfiles = profiles.filter((p) => !excludeKeys?.has(profileValue(p.id)) && fits(p.position_id, profileValue(p.id)))
  const visibleWorkers = workers.filter(
    (w) => (!w.archived_at || workerValue(w.id) === value) && !excludeKeys?.has(workerValue(w.id)) && fits(w.position_id, workerValue(w.id)),
  )

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{noneLabel}</option>
      {visibleProfiles.length > 0 && (
        <optgroup label="Пользователи (вход в систему)">
          {visibleProfiles.map((p) => (
            <option key={p.id} value={profileValue(p.id)}>
              {shortName(p.full_name)} — {ROLE_LABELS[p.role]}
            </option>
          ))}
        </optgroup>
      )}
      {visibleWorkers.length > 0 && (
        <optgroup label="Работники">
          {visibleWorkers.map((w) => (
            <option key={w.id} value={workerValue(w.id)}>
              {shortName(w.full_name)}
              {w.archived_at ? ' (архивирован)' : ''}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}
