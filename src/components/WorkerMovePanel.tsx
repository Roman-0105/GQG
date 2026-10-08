import { useCallback, useEffect, useState } from 'react'
import { Clock, Repeat, LogIn, LogOut, CalendarPlus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { addDaysIso, formatRu, stayInfo, todayIso } from '../lib/workerStay'
import type { DrillingTask, WorkerEvent, WorkerStay } from '../types/database'
import Modal from './Modal'

export interface MasterOption {
  id: string
  name: string
  onDuty: boolean | null
}

interface Props {
  workerId: string
  workerName: string
  foremanId: string | null
  canManage: boolean
  masters: MasterOption[]
  activeTasks: DrillingTask[]
  onChanged: () => void
}

const REASONS = ['Смена вахты', 'Перестановка', 'Подмена', 'Другое']

// Вахта и перемещения работника (07.10.2026, миграция 0033): заезд, плановые
// дни, продление, переработка, выезд, перевод к другому мастеру и хронология.
export default function WorkerMovePanel({ workerId, workerName, foremanId, canManage, masters, activeTasks, onChanged }: Props) {
  const [stay, setStay] = useState<WorkerStay | null>(null)
  const [events, setEvents] = useState<WorkerEvent[]>([])
  const [modal, setModal] = useState<'transfer' | 'start' | 'extend' | 'depart' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // поля форм
  const [toId, setToId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [reason, setReason] = useState(REASONS[0])
  const [reasonText, setReasonText] = useState('')
  const [moveAsg, setMoveAsg] = useState(false)
  const [taskId, setTaskId] = useState('')
  const [role, setRole] = useState<'driller' | 'assistant_driller'>('driller')
  const [shift, setShift] = useState<1 | 2>(1)
  const [days, setDays] = useState('15')
  const [newDeparture, setNewDeparture] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const [stayRes, evRes] = await Promise.all([
      supabase.from('worker_stays').select('*').eq('worker_id', workerId).is('departed_on', null).maybeSingle(),
      supabase.from('worker_events').select('*').eq('worker_id', workerId).order('event_date', { ascending: false }).order('created_at', { ascending: false }).limit(12),
    ])
    setStay((stayRes.data as WorkerStay | null) ?? null)
    setEvents((evRes.data ?? []) as WorkerEvent[])
  }, [workerId])

  useEffect(() => {
    load()
  }, [load])

  function open(kind: 'transfer' | 'start' | 'extend' | 'depart') {
    setError(null)
    setDate(todayIso())
    setReason(REASONS[0])
    setReasonText('')
    setToId('')
    setMoveAsg(false)
    setTaskId('')
    setDays('15')
    setNote('')
    setNewDeparture(stay ? addDaysIso(stay.planned_departure, 5) : '')
    setModal(kind)
  }

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await fn()
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setModal(null)
    await load()
    onChanged()
  }

  const info = stay ? stayInfo(stay) : null
  const newMasterTasks = activeTasks.filter((t) => t.foreman_id === toId)
  const otherMasters = masters.filter((m) => m.id !== foremanId)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div className="eyebrow">Вахта</div>
        {stay && info ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 5, flexWrap: 'wrap' }}>
              <span>Заезд {formatRu(stay.arrived_on)} · план {stay.planned_days} дн.</span>
              {info.overtime > 0 ? (
                <span className="badge badge-warning" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  <Clock size={12} /> переработка +{info.overtime} дн.
                </span>
              ) : info.soon ? (
                <span className="badge badge-neutral">осталось {info.remaining} дн.</span>
              ) : (
                <span className="text-muted" style={{ fontSize: 12 }}>осталось {info.remaining} дн.</span>
              )}
            </div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, background: 'var(--color-surface-muted)', overflow: 'hidden' }}>
              <div style={{ width: `${info.plannedPct}%`, background: 'var(--color-primary)' }} />
              <div style={{ width: `${info.overtimePct}%`, background: 'var(--color-warning)' }} />
            </div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Плановый выезд {formatRu(stay.planned_departure)}</div>
          </>
        ) : (
          <div className="text-muted" style={{ fontSize: 13 }}>Вахта не начата</div>
        )}
      </div>

      {canManage && (
        <div style={{ display: 'grid', gap: 6 }}>
          {stay ? (
            <>
              <button type="button" className="btn-outline" onClick={() => open('extend')} style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                <CalendarPlus size={14} /> Продлить вахту
              </button>
              <button type="button" className="btn-outline" onClick={() => open('depart')} style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                <LogOut size={14} /> Отметить выезд
              </button>
            </>
          ) : (
            <button type="button" className="btn-outline" onClick={() => open('start')} style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
              <LogIn size={14} /> Начать вахту
            </button>
          )}
          <button type="button" className="btn-outline" onClick={() => open('transfer')} style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            <Repeat size={14} /> Перевести к мастеру
          </button>
        </div>
      )}

      {events.length > 0 && (
        <div>
          <div className="eyebrow">Хронология</div>
          <div style={{ display: 'grid', gap: 6, borderLeft: '1px solid var(--color-border-strong)', paddingLeft: 12, marginLeft: 4 }}>
            {events.map((e) => (
              <div key={e.id} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                <span className="num">{formatRu(e.event_date).slice(0, 5)}</span> — {e.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ----- перевод */}
      <Modal open={modal === 'transfer'} onClose={() => setModal(null)} title={`Перевод: ${workerName}`}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Новый мастер
            <select value={toId} onChange={(e) => { setToId(e.target.value); setTaskId('') }}>
              <option value="">Выберите мастера…</option>
              {otherMasters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.onDuty == null ? '' : m.onDuty ? ' · на вахте' : ' · не на вахте'}
                </option>
              ))}
            </select>
          </label>
          <label>
            С даты
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Причина
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {reason === 'Другое' && (
            <label>
              Комментарий
              <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
            </label>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--color-text)' }}>
            <input type="checkbox" checked={moveAsg} onChange={(e) => setMoveAsg(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} />
            <span>
              Перенести назначения на скважинах
              <span className="text-muted" style={{ display: 'block', fontSize: 12, fontWeight: 400 }}>закрыть назначения у прежнего мастера, открыть у нового</span>
            </span>
          </label>
          {moveAsg && (
            <div style={{ display: 'grid', gap: 8 }}>
              <label>
                Скважина нового мастера
                <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!toId}>
                  <option value="">Не назначать на скважину</option>
                  {newMasterTasks.map((t) => (
                    <option key={t.id} value={t.id}>№{t.well_number}</option>
                  ))}
                </select>
              </label>
              {taskId && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label>
                    Роль
                    <select value={role} onChange={(e) => setRole(e.target.value as 'driller' | 'assistant_driller')}>
                      <option value="driller">Буровик</option>
                      <option value="assistant_driller">Помощник бурильщика</option>
                    </select>
                  </label>
                  <label>
                    Смена
                    <select value={shift} onChange={(e) => setShift(Number(e.target.value) as 1 | 2)}>
                      <option value={1}>Смена 1</option>
                      <option value={2}>Смена 2</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
          {error && <p className="text-error" style={{ margin: 0 }}>{error}</p>}
          <button
            type="button"
            disabled={busy || !toId}
            onClick={() =>
              run(() =>
                supabase.rpc('transfer_worker', {
                  p_worker: workerId,
                  p_to: toId,
                  p_date: date,
                  p_reason: reason === 'Другое' ? reasonText.trim() || 'другое' : reason,
                  p_move_assignments: moveAsg,
                  p_task: moveAsg && taskId ? taskId : null,
                  p_role: moveAsg && taskId ? role : null,
                  p_shift: moveAsg && taskId ? shift : null,
                }),
              )
            }
          >
            {busy ? 'Переводим…' : 'Перевести'}
          </button>
        </div>
      </Modal>

      {/* ----- начать вахту */}
      <Modal open={modal === 'start'} onClose={() => setModal(null)} title={`Вахта: ${workerName}`}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Дата заезда
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Плановое число дней
            <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
          <div className="text-muted" style={{ fontSize: 12.5 }}>Плановый выезд: {formatRu(addDaysIso(date, Number(days) || 0))}</div>
          {error && <p className="text-error" style={{ margin: 0 }}>{error}</p>}
          <button type="button" disabled={busy || Number(days) < 1} onClick={() => run(() => supabase.rpc('start_worker_stay', { p_worker: workerId, p_arrived: date, p_days: Number(days) }))}>
            {busy ? 'Сохраняем…' : 'Начать вахту'}
          </button>
        </div>
      </Modal>

      {/* ----- продлить */}
      <Modal open={modal === 'extend'} onClose={() => setModal(null)} title={`Продлить вахту: ${workerName}`}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            Сейчас плановый выезд {formatRu(stay?.planned_departure)}
          </div>
          <label>
            Новая дата выезда
            <input type="date" value={newDeparture} onChange={(e) => setNewDeparture(e.target.value)} />
          </label>
          <label>
            Причина (по желанию)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: нет замены" />
          </label>
          {error && <p className="text-error" style={{ margin: 0 }}>{error}</p>}
          <button type="button" disabled={busy || !newDeparture} onClick={() => run(() => supabase.rpc('extend_worker_stay', { p_worker: workerId, p_new_departure: newDeparture, p_note: note.trim() || null }))}>
            {busy ? 'Сохраняем…' : 'Продлить'}
          </button>
        </div>
      </Modal>

      {/* ----- выезд */}
      <Modal open={modal === 'depart'} onClose={() => setModal(null)} title={`Выезд: ${workerName}`}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label>
            Дата выезда
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {error && <p className="text-error" style={{ margin: 0 }}>{error}</p>}
          <button type="button" disabled={busy} onClick={() => run(() => supabase.rpc('depart_worker', { p_worker: workerId, p_date: date }))}>
            {busy ? 'Сохраняем…' : 'Отметить выезд'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
