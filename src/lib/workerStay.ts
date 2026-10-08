import type { WorkerStay } from '../types/database'

const DAY = 86400000

function toDay(iso: string) {
  return new Date(iso.slice(0, 10) + 'T00:00:00').getTime()
}

export function todayIso() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDaysIso(iso: string, n: number) {
  const d = new Date(toDay(iso) + n * DAY)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function formatRu(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export interface StayInfo {
  // сколько дней человек уже на вахте (с заезда по сегодня включительно)
  daysOn: number
  planned: number
  overtime: number
  remaining: number
  // доли шкалы (в процентах): в плане и сверх плана
  plannedPct: number
  overtimePct: number
  soon: boolean
}

export function stayInfo(stay: WorkerStay, today = todayIso()): StayInfo {
  const daysOn = Math.max(0, Math.round((toDay(today) - toDay(stay.arrived_on)) / DAY) + 1)
  const planned = stay.planned_days
  const overtime = Math.max(0, Math.round((toDay(today) - toDay(stay.planned_departure)) / DAY))
  const remaining = Math.max(0, Math.round((toDay(stay.planned_departure) - toDay(today)) / DAY))
  const total = Math.max(planned, daysOn)
  const plannedPct = Math.min(100, (Math.min(daysOn, planned) / total) * 100)
  const overtimePct = overtime > 0 ? Math.min(100 - plannedPct, (overtime / total) * 100) : 0
  return { daysOn, planned, overtime, remaining, plannedPct, overtimePct, soon: overtime === 0 && remaining <= 3 }
}
