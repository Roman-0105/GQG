import { X } from 'lucide-react'
import type { Profile } from '../types/database'

// Выбор нескольких ответственных (03.10.2026): чипы выбранных людей с
// крестиком + select «добавить». Используется при назначении геологов на
// геологические работы скважины.
export default function AssigneesPicker({
  candidates,
  value,
  onChange,
  placeholder = '+ добавить ответственного',
  disabled = false,
}: {
  candidates: Pick<Profile, 'id' | 'full_name'>[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const available = candidates.filter((c) => !value.includes(c.id))

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {value.map((id) => (
            <span
              key={id}
              className="badge badge-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 10px', fontSize: 13 }}
            >
              {byId.get(id)?.full_name ?? 'Неизвестный пользователь'}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  aria-label="Убрать"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value])
          }}
        >
          <option value="">{available.length === 0 ? 'Все доступные уже добавлены' : placeholder}</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
