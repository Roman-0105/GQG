import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, Layers, FlaskConical, Scissors } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import AssigneesPicker from '../../components/AssigneesPicker'
import DerrickIcon from '../../components/icons/DerrickIcon'
import { useAreaCandidates } from '../../hooks/useAreaCandidates'
import AreaFilterHint from '../../components/AreaFilterHint'
import type { DrillingTask } from '../../types/database'
import { shortName } from '../../lib/shortName'

// Мастер создания геологических работ на скважине (03.10.2026).
// Шаги: 1 — скважина, 2 — какие работы и кто ответственный, 3 — проверка.
// В базе остаются отдельные задания (разные ответственные и согласование),
// но руководитель создаёт их одним проходом. Работает и как «настроить
// геологические работы» для уже существующей скважины: уже созданные работы
// отмечены и заблокированы для снятия (у них могут быть сводки).

type WorkKey = 'geological' | 'geotechnical' | 'sawing' | 'sampling'

interface WorkDef {
  key: WorkKey
  label: string
  hint: string
  icon: LucideIcon
  table: 'core_description_tasks' | 'core_sawing_tasks' | 'sampling_tasks'
  assigneeColumn: 'core_description_task_id' | 'core_sawing_task_id' | 'sampling_task_id'
}

const WORKS: WorkDef[] = [
  {
    key: 'geological',
    label: 'Геологическая документация',
    hint: 'Описание керна, фотофиксация',
    icon: Layers,
    table: 'core_description_tasks',
    assigneeColumn: 'core_description_task_id',
  },
  {
    key: 'geotechnical',
    label: 'Геотехническая документация',
    hint: 'Геотехнический каротаж керна',
    icon: Layers,
    table: 'core_description_tasks',
    assigneeColumn: 'core_description_task_id',
  },
  {
    key: 'sawing',
    label: 'Распиловка керна',
    hint: 'Метраж по сменам (день / ночь)',
    icon: Scissors,
    table: 'core_sawing_tasks',
    assigneeColumn: 'core_sawing_task_id',
  },
  {
    key: 'sampling',
    label: 'Опробование',
    hint: 'Отбор проб по видам',
    icon: FlaskConical,
    table: 'sampling_tasks',
    assigneeColumn: 'sampling_task_id',
  },
]

interface WorkState {
  enabled: boolean
  existingId: string | null
  assignees: string[]
}

const emptyWorks = (): Record<WorkKey, WorkState> => ({
  geological: { enabled: false, existingId: null, assignees: [] },
  geotechnical: { enabled: false, existingId: null, assignees: [] },
  sawing: { enabled: false, existingId: null, assignees: [] },
  sampling: { enabled: false, existingId: null, assignees: [] },
})

const STEPS = ['Скважина', 'Работы и ответственные', 'Проверка']

export default function GeologyTaskWizard() {
  const { siteId } = useParams<{ siteId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { session, profile, loading: authLoading } = useAuth()

  const [wells, setWells] = useState<DrillingTask[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [wellId, setWellId] = useState(searchParams.get('well') ?? '')
  const [works, setWorks] = useState<Record<WorkKey, WorkState>>(emptyWorks)
  const areaPick = useAreaCandidates('geology', Object.values(works).flatMap((w) => w.assignees))
  const geologists = areaPick.candidates
  const [existingLoading, setExistingLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const justCreatedWell = searchParams.get('after') === 'drilling'

  // Скважины участка + кандидаты в ответственные
  useEffect(() => {
    if (!session || !siteId) return
    let cancelled = false
    Promise.all([
      supabase.from('drilling_tasks').select('*').eq('site_id', siteId).order('well_number'),
    ]).then(([wellsRes]) => {
      if (cancelled) return
      setWells((wellsRes.data ?? []) as DrillingTask[])
      setLoading(false)
      if (searchParams.get('well')) setStep(1)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, siteId])

  // Уже существующие работы выбранной скважины
  useEffect(() => {
    if (!wellId) return
    let cancelled = false
    async function loadExisting() {
      setExistingLoading(true)
      const [coreRes, sawRes, sampRes] = await Promise.all([
        supabase.from('core_description_tasks').select('id, documentation_type, assigned_party_chief_id').eq('drilling_task_id', wellId),
        supabase.from('core_sawing_tasks').select('id').eq('drilling_task_id', wellId),
        supabase.from('sampling_tasks').select('id, assigned_party_chief_id').eq('drilling_task_id', wellId),
      ])
      const coreRows = (coreRes.data ?? []) as { id: string; documentation_type: string; assigned_party_chief_id: string | null }[]
      const sawRows = (sawRes.data ?? []) as { id: string }[]
      const sampRows = (sampRes.data ?? []) as { id: string; assigned_party_chief_id: string | null }[]
      const taskIds = [...coreRows.map((r) => r.id), ...sawRows.map((r) => r.id), ...sampRows.map((r) => r.id)]
      const assigneeRows = taskIds.length
        ? (
            await supabase
              .from('task_assignees')
              .select('core_description_task_id, core_sawing_task_id, sampling_task_id, profile_id')
              .or(
                [
                  coreRows.length ? `core_description_task_id.in.(${coreRows.map((r) => r.id).join(',')})` : null,
                  sawRows.length ? `core_sawing_task_id.in.(${sawRows.map((r) => r.id).join(',')})` : null,
                  sampRows.length ? `sampling_task_id.in.(${sampRows.map((r) => r.id).join(',')})` : null,
                ]
                  .filter(Boolean)
                  .join(','),
              )
          ).data ?? []
        : []
      if (cancelled) return

      function assigneesFor(column: 'core_description_task_id' | 'core_sawing_task_id' | 'sampling_task_id', id: string, primary: string | null) {
        const ids = (assigneeRows as Record<string, string | null>[])
          .filter((a) => a[column] === id)
          .map((a) => a.profile_id as string)
        if (primary && !ids.includes(primary)) ids.unshift(primary)
        return ids
      }

      const next = emptyWorks()
      for (const key of ['geological', 'geotechnical'] as const) {
        const row = coreRows.find((r) => r.documentation_type === key)
        if (row) {
          next[key] = {
            enabled: true,
            existingId: row.id,
            assignees: assigneesFor('core_description_task_id', row.id, row.assigned_party_chief_id),
          }
        }
      }
      if (sawRows[0]) {
        next.sawing = {
          enabled: true,
          existingId: sawRows[0].id,
          assignees: assigneesFor('core_sawing_task_id', sawRows[0].id, null),
        }
      }
      if (sampRows[0]) {
        next.sampling = {
          enabled: true,
          existingId: sampRows[0].id,
          assignees: assigneesFor('sampling_task_id', sampRows[0].id, sampRows[0].assigned_party_chief_id),
        }
      }
      setWorks(next)
      setExistingLoading(false)
    }
    loadExisting()
    return () => {
      cancelled = true
    }
  }, [wellId])

  const selectedWell = useMemo(() => wells.find((w) => w.id === wellId) ?? null, [wells, wellId])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) return <p>Создавать задания может только руководство.</p>
  if (!siteId) return <p>Не указан участок.</p>

  const enabledWorks = WORKS.filter((w) => works[w.key].enabled)
  // Для керна и опробования ответственный обязателен (в таблицах колонка
  // используется для доступа); у распиловки допускается пустой список.
  const missingAssignee = enabledWorks.filter((w) => w.key !== 'sawing' && works[w.key].assignees.length === 0)
  const nameOf = (id: string) => shortName(areaPick.all.find((g) => g.id === id)?.full_name) || '—'

  function setWork(key: WorkKey, patch: Partial<WorkState>) {
    setWorks((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  function addToAll(id: string) {
    setWorks((prev) => {
      const next = { ...prev }
      for (const w of WORKS) {
        const cur = next[w.key]
        if (cur.enabled && !cur.assignees.includes(id)) next[w.key] = { ...cur, assignees: [...cur.assignees, id] }
      }
      return next
    })
  }

  async function handleSave() {
    if (!profile || !selectedWell) return
    setSaving(true)
    setError(null)
    try {
      for (const def of enabledWorks) {
        const state = works[def.key]
        const primary = state.assignees[0] ?? null
        let taskId = state.existingId

        if (def.table === 'core_description_tasks') {
          if (taskId) {
            const { error: e } = await supabase
              .from('core_description_tasks')
              .update({ assigned_party_chief_id: primary })
              .eq('id', taskId)
            if (e) throw e
          } else {
            const { data, error: e } = await supabase
              .from('core_description_tasks')
              .insert({
                site_id: siteId,
                drilling_task_id: selectedWell.id,
                documentation_type: def.key,
                shift_enabled: false,
                assigned_party_chief_id: primary,
                created_by: profile.id,
              })
              .select('id')
              .single()
            if (e) throw e
            taskId = data.id
          }
        } else if (def.table === 'core_sawing_tasks') {
          if (!taskId) {
            const { data, error: e } = await supabase
              .from('core_sawing_tasks')
              .insert({ site_id: siteId, drilling_task_id: selectedWell.id, created_by: profile.id })
              .select('id')
              .single()
            if (e) throw e
            taskId = data.id
          }
        } else {
          if (taskId) {
            const { error: e } = await supabase
              .from('sampling_tasks')
              .update({ assigned_party_chief_id: primary })
              .eq('id', taskId)
            if (e) throw e
          } else {
            const { data, error: e } = await supabase
              .from('sampling_tasks')
              .insert({
                site_id: siteId,
                drilling_task_id: selectedWell.id,
                assigned_party_chief_id: primary,
                created_by: profile.id,
              })
              .select('id')
              .single()
            if (e) throw e
            taskId = data.id
          }
        }

        // Список ответственных: пересобираем целиком (как диаметры и затраты).
        const { error: delErr } = await supabase.from('task_assignees').delete().eq(def.assigneeColumn, taskId)
        if (delErr) throw delErr
        if (state.assignees.length > 0) {
          const { error: insErr } = await supabase
            .from('task_assignees')
            .insert(state.assignees.map((pid) => ({ [def.assigneeColumn]: taskId, profile_id: pid })))
          if (insErr) throw insErr
        }
      }
      navigate(`/sites/${siteId}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message
      setError(
        msg?.includes('task_assignees')
          ? 'Не применена миграция 0021 (таблица task_assignees). Примените её в Supabase SQL Editor.'
          : (msg ?? 'Не удалось сохранить'),
      )
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Link to={`/sites/${siteId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, marginBottom: 10 }}>
        <ChevronLeft size={15} /> Участок
      </Link>
      <h1 style={{ marginTop: 0 }}>Геология на скважине</h1>

      {justCreatedWell && (
        <p className="text-success" style={{ marginTop: -6 }}>
          Скважина создана. Можно сразу назначить геологические работы — или нажать «Без геологии» и вернуться на участок (геологию можно назначить позже).
        </p>
      )}

      <ol style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, margin: '0 0 18px', flexWrap: 'wrap' }}>
        {STEPS.map((label, i) => (
          <li
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 13,
              fontWeight: i === step ? 700 : 500,
              color: i <= step ? 'var(--color-text)' : 'var(--color-text-faint)',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                background: i < step ? 'var(--color-primary)' : i === step ? 'var(--color-accent)' : 'var(--color-border)',
                color: i <= step ? '#fff' : 'var(--color-text-faint)',
              }}
            >
              {i < step ? <Check size={13} /> : i + 1}
            </span>
            {label}
            {i < STEPS.length - 1 && <span className="text-faint">›</span>}
          </li>
        ))}
      </ol>

      {loading ? (
        <div className="skeleton" style={{ height: 160, borderRadius: 'var(--radius-md)' }} />
      ) : (
        <>
          {step === 0 && (
            <div className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
              <h2 style={{ margin: 0 }}>На какой скважине?</h2>
              {wells.length === 0 ? (
                <p className="text-muted" style={{ margin: 0 }}>
                  На участке ещё нет скважин. Сначала создайте задание на бурение.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {wells.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className={wellId === w.id ? '' : 'btn-outline'}
                      onClick={() => setWellId(w.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-start', textAlign: 'left', minHeight: 48 }}
                    >
                      <DerrickIcon size={16} />
                      Скважина №{w.well_number}
                      {w.projected_depth != null && <span style={{ opacity: 0.75, fontWeight: 400 }}>· {w.projected_depth} м</span>}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                Геология на скважине подрядчика создаётся отдельно:{' '}
                <Link to={`/sites/${siteId}/tasks/core-description/new`}>описание керна</Link>,{' '}
                <Link to={`/sites/${siteId}/tasks/sampling/new`}>опробование</Link>.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={!wellId} onClick={() => setStep(1)}>
                  Далее
                </button>
                {justCreatedWell && (
                  <button type="button" className="btn-outline" onClick={() => navigate(`/sites/${siteId}`)}>
                    Пропустить
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <h2 style={{ margin: 0 }}>Скважина №{selectedWell?.well_number}: работы и ответственные</h2>
              {existingLoading ? (
                <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-md)' }} />
              ) : (
                <>
                  <AreaFilterHint pick={areaPick} what="геологи" />
                  {enabledWorks.length > 1 && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Одни и те же ответственные для всех выбранных работ</span>
                      <AssigneesPicker
                        candidates={geologists}
                        value={[]}
                        onChange={(ids) => ids[0] && addToAll(ids[0])}
                        placeholder="+ назначить всем"
                      />
                    </div>
                  )}
                  {WORKS.map((def) => {
                    const state = works[def.key]
                    const locked = state.existingId != null
                    return (
                      <div
                        key={def.key}
                        style={{
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          padding: 12,
                          display: 'grid',
                          gap: 10,
                          background: state.enabled ? 'var(--color-surface)' : 'transparent',
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: locked ? 'default' : 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={state.enabled}
                            disabled={locked}
                            onChange={(e) => setWork(def.key, { enabled: e.target.checked })}
                            style={{ width: 20, height: 20, flexShrink: 0 }}
                          />
                          <def.icon size={17} className="text-muted" />
                          <span style={{ display: 'grid' }}>
                            <span style={{ fontWeight: 600 }}>{def.label}</span>
                            <span className="text-muted" style={{ fontSize: 12 }}>
                              {def.hint}
                              {locked ? ' · уже создана' : ''}
                            </span>
                          </span>
                        </label>
                        {state.enabled && (
                          <div style={{ display: 'grid', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>
                              Ответственные{def.key === 'sawing' ? ' (необязательно)' : ''}
                            </span>
                            <AssigneesPicker
                              candidates={geologists}
                              value={state.assignees}
                              onChange={(ids) => setWork(def.key, { assignees: ids })}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {areaPick.allCount === 0 && (
                    <p className="text-error" style={{ margin: 0 }}>
                      Нет пользователей с ролью «Ответственный». Создайте их в «Настройки → Пользователи».
                    </p>
                  )}
                </>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn-outline" onClick={() => setStep(0)}>
                  Назад
                </button>
                <button type="button" disabled={enabledWorks.length === 0 || missingAssignee.length > 0} onClick={() => setStep(2)}>
                  Далее
                </button>
                {/* Скважина уже создана — геологию можно не назначать (или сделать позже
                    из правки задания / «+ Задание → Геология»). */}
                <button type="button" className="btn-outline" onClick={() => navigate(`/sites/${siteId}`)}>
                  {justCreatedWell ? 'Без геологии — готово' : 'Закрыть'}
                </button>
              </div>
              {missingAssignee.length > 0 && (
                <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                  Назначьте ответственного: {missingAssignee.map((w) => w.label.toLowerCase()).join(', ')}.
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
              <h2 style={{ margin: 0 }}>Проверьте и сохраните</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                <div>
                  <span className="text-muted">Скважина:</span> <b>№{selectedWell?.well_number}</b>
                </div>
                {enabledWorks.map((w) => (
                  <div key={w.key} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <b>{w.label}</b>
                    <span className="text-muted">
                      {works[w.key].existingId ? '(уже есть) ' : '(будет создана) '}—{' '}
                      {works[w.key].assignees.length > 0
                        ? works[w.key].assignees.map(nameOf).join(', ')
                        : 'ответственный не назначен'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                Ответственные смогут открыть своё задание, вносить сводки только по геологической части и видеть
                прогресс бурения этой скважины.
              </p>
              {error && <p className="text-error" style={{ margin: 0 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-outline" onClick={() => setStep(1)} disabled={saving}>
                  Назад
                </button>
                <button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
