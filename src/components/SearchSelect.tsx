import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export interface SearchOption {
  value: string
  label: string
  hint?: string
  group?: string
}

interface Props {
  options: SearchOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyLabel?: string
  disabled?: boolean
  ariaLabel?: string
}

// Выпадающий список с поиском: можно выбрать из списка или набрать часть
// названия («1201», «ZKB»), список сразу сужается (06.10.2026, вкладка «Отчёты»).
export default function SearchSelect({ options, value, onChange, placeholder = 'Выберите…', emptyLabel = 'Все', disabled, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = options.find((o) => o.value === value)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => (o.label + ' ' + (o.hint ?? '') + ' ' + (o.group ?? '')).toLowerCase().includes(q))
  }, [options, query])

  const groups: string[] = []
  for (const o of filtered) if (o.group && !groups.includes(o.group)) groups.push(o.group)

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  const row = (o: SearchOption) => (
    <button
      key={o.value}
      type="button"
      role="option"
      aria-selected={o.value === value}
      onClick={() => pick(o.value)}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        width: '100%',
        cursor: 'pointer',
        padding: '9px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        fontSize: 13,
        color: 'var(--color-text)',
        background: o.value === value ? 'var(--color-primary-soft)' : 'transparent',
      }}
    >
      <span style={{ fontWeight: o.value === value ? 700 : 500 }}>{o.label}</span>
      {o.hint && <span className="text-muted" style={{ fontSize: 12 }}>{o.hint}</span>}
    </button>
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((v) => !v)
          setTimeout(() => inputRef.current?.focus(), 30)
        }}
        className="btn-outline"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 40, textAlign: 'left', fontWeight: 500, color: selected ? 'var(--color-text)' : 'var(--color-text-muted)' }}
      >
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : value === '' ? emptyLabel : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {value !== '' && !disabled && (
            <span
              role="button"
              aria-label="Сбросить"
              onClick={(e) => {
                e.stopPropagation()
                pick('')
              }}
              style={{ display: 'flex', padding: 2 }}
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={15} />
        </span>
      </button>
      {open && (
        <div
          className="card"
          role="listbox"
          style={{ position: 'absolute', zIndex: 40, left: 0, right: 0, top: 'calc(100% + 4px)', padding: 6, boxShadow: 'var(--shadow-md)', maxHeight: 320, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 8px' }}>
            <Search size={15} className="text-muted" />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию или номеру"
              style={{ border: 'none', padding: 0, minHeight: 0, boxShadow: 'none', background: 'transparent' }}
            />
          </div>
          <div style={{ overflowY: 'auto' }}>
            <button
              type="button"
              onClick={() => pick('')}
              style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', padding: '9px 12px', fontSize: 13, color: 'var(--color-text-muted)' }}
            >
              {emptyLabel}
            </button>
            {groups.length === 0
              ? filtered.map(row)
              : groups.map((g) => (
                  <div key={g}>
                    <div className="eyebrow" style={{ padding: '8px 12px 2px' }}>{g}</div>
                    {filtered.filter((o) => o.group === g).map(row)}
                  </div>
                ))}
            {filtered.length === 0 && <div className="text-muted" style={{ padding: '10px 12px', fontSize: 13 }}>Ничего не найдено</div>}
          </div>
        </div>
      )}
    </div>
  )
}
