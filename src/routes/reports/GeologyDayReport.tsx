import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Check, ChevronLeft, FlaskConical, Layers, MessageCircle, Plus, Scissors, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { notifyReportsChanged } from '../../hooks/useReportCounts'
import { round2 } from '../../lib/taskProgress'
import { buildGeologyDayMessage } from '../../lib/geologyMessage'
import type { GeologyWellBlock } from '../../lib/geologyMessage'
import type {
  CoreDescriptionTask,
  CoreSawingTask,
  DrillingTask,
  Report,
  SampleType,
  SamplingTask,
  Site,
} from '../../types/database'

// «Сводка геологов за день» (03.10.2026). Одна форма на весь участок и день —
// так сводку и присылают в WhatsApp: по каждой скважине документация керна,
// распиловка (день/ночь), пробы по видам. Каждая заполненная строка при
// сохранении становится обычной строкой reports по своему заданию, поэтому
// согласование техдиректором работает как у остальных сводок.

interface WellGroup {
  key: string
  label: string
  geo?: CoreDescriptionTask
  geotech?: CoreDescriptionTask
  sawing?: CoreSawingTask
  sampling?: SamplingTask
}

interface DocForm {
  from: string
  to: string
  photoFrom: string
  photoTo: string
  finished: boolean
  reportId: string | null
  locked: boolean
}

interface SawForm {
  day: string
  night: string
  dayId: string | null
  nightId: string | null
  dayLocked: boolean
  nightLocked: boolean
}

interface SampleRow {
  typeId: string
  qty: string
}

interface SampForm {
  rows: SampleRow[]
  layout: boolean
  reportId: string | null
  locked: boolean
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))
const isEditable = (r: Pick<Report, 'approval_status' | 'edit_unlocked'>) =>
  r.approval_status === 'draft' || r.edit_unlocked

export default function GeologyDayReport() {
  const { session, profile, loading: authLoading } = useAuth()

  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [sampleTypes, setSampleTypes] = useState<SampleType[]>([])

  const [groups, setGroups] = useState<WellGroup[]>([])
  const [docs, setDocs] = useState<Record<string, DocForm>>({})
  const [saws, setSaws] = useState<Record<string, SawForm>>({})
  const [samps, setSamps] = useState<Record<string, SampForm>>({})

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // участки + виды проб
  useEffect(() => {
    if (!session) return
    Promise.all([
      supabase.from('sites').select('*').order('name'),
      supabase.from('sample_types').select('*').order('name'),
    ]).then(([sitesRes, typesRes]) => {
      const list = (sitesRes.data ?? []) as Site[]
      setSites(list)
      setSampleTypes((typesRes.data ?? []) as SampleType[])
      setSiteId((cur) => cur || (list.find((s) => s.status === 'active') ?? list[0])?.id || '')
      if (list.length === 0) setLoading(false)
    })
  }, [session])

  // задания участка + уже внесённые сводки за выбранную дату
  useEffect(() => {
    if (!session || !siteId || !profile) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const [coreRes, sawRes, sampRes, wellRes] = await Promise.all([
        supabase.from('core_description_tasks').select('*').eq('site_id', siteId),
        supabase.from('core_sawing_tasks').select('*').eq('site_id', siteId),
        supabase.from('sampling_tasks').select('*').eq('site_id', siteId),
        supabase.from('drilling_tasks').select('*').eq('site_id', siteId),
      ])
      if (cancelled) return
      const cores = (coreRes.data ?? []) as CoreDescriptionTask[]
      const sawings = (sawRes.data ?? []) as CoreSawingTask[]
      const samplings = (sampRes.data ?? []) as SamplingTask[]
      const wells = (wellRes.data ?? []) as DrillingTask[]
      const wellNumber = (id: string | null) => wells.find((w) => w.id === id)?.well_number ?? '?'

      const map = new Map<string, WellGroup>()
      const ensure = (key: string, label: string) => {
        if (!map.has(key)) map.set(key, { key, label })
        return map.get(key)!
      }
      for (const c of cores) {
        const g = c.drilling_task_id
          ? ensure(c.drilling_task_id, wellNumber(c.drilling_task_id))
          : ensure(`ext-${c.external_well_number}`, c.external_well_number ?? '?')
        if (c.documentation_type === 'geotechnical') g.geotech = c
        else g.geo = c
      }
      for (const s of sawings) ensure(s.drilling_task_id, wellNumber(s.drilling_task_id)).sawing = s
      for (const s of samplings) {
        const g = s.drilling_task_id
          ? ensure(s.drilling_task_id, wellNumber(s.drilling_task_id))
          : ensure(`ext-${s.external_well_number}`, s.external_well_number ?? '?')
        g.sampling = s
      }
      const list = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))

      const coreIds = cores.map((c) => c.id)
      const sawIds = sawings.map((s) => s.id)
      const sampIds = samplings.map((s) => s.id)
      const orParts = [
        coreIds.length ? `core_description_task_id.in.(${coreIds.join(',')})` : null,
        sawIds.length ? `core_sawing_task_id.in.(${sawIds.join(',')})` : null,
        sampIds.length ? `sampling_task_id.in.(${sampIds.join(',')})` : null,
      ].filter(Boolean)

      let allReports: Report[] = []
      if (orParts.length > 0) {
        const { data } = await supabase
          .from('reports')
          .select('*')
          .eq('author_id', profile!.id)
          .or(orParts.join(','))
        allReports = (data ?? []) as Report[]
      }
      const sameDay = allReports.filter((r) => r.report_date === date)
      const earlier = allReports.filter((r) => r.report_date < date)

      const sameDayIds = sameDay.map((r) => r.id)
      const sampleRowsByReport = new Map<string, SampleRow[]>()
      if (sameDayIds.length > 0) {
        const { data } = await supabase.from('report_samples').select('*').in('report_id', sameDayIds)
        for (const row of (data ?? []) as { report_id: string; sample_type_id: string; quantity: number }[]) {
          const arr = sampleRowsByReport.get(row.report_id) ?? []
          arr.push({ typeId: row.sample_type_id, qty: String(row.quantity) })
          sampleRowsByReport.set(row.report_id, arr)
        }
      }
      if (cancelled) return

      const prevMax = (taskId: string, field: 'core_description_interval_to' | 'photofixation_interval_to') =>
        earlier
          .filter((r) => r.core_description_task_id === taskId)
          .reduce((m, r) => Math.max(m, r[field] ?? 0), 0)

      const nextDocs: Record<string, DocForm> = {}
      for (const c of cores) {
        const existing = sameDay.find((r) => r.core_description_task_id === c.id)
        nextDocs[c.id] = {
          from: String(prevMax(c.id, 'core_description_interval_to')),
          to: existing?.core_description_interval_to != null ? String(existing.core_description_interval_to) : '',
          photoFrom: String(prevMax(c.id, 'photofixation_interval_to')),
          photoTo: existing?.photofixation_interval_to != null ? String(existing.photofixation_interval_to) : '',
          finished: existing?.documentation_finished ?? false,
          reportId: existing?.id ?? null,
          locked: existing ? !isEditable(existing) : false,
        }
      }
      const nextSaws: Record<string, SawForm> = {}
      for (const s of sawings) {
        const day = sameDay.find((r) => r.core_sawing_task_id === s.id && r.shift_number === 1)
        const night = sameDay.find((r) => r.core_sawing_task_id === s.id && r.shift_number === 2)
        nextSaws[s.id] = {
          day: day?.sawn_meters != null ? String(day.sawn_meters) : '',
          night: night?.sawn_meters != null ? String(night.sawn_meters) : '',
          dayId: day?.id ?? null,
          nightId: night?.id ?? null,
          dayLocked: day ? !isEditable(day) : false,
          nightLocked: night ? !isEditable(night) : false,
        }
      }
      const nextSamps: Record<string, SampForm> = {}
      for (const s of samplings) {
        const existing = sameDay.find((r) => r.sampling_task_id === s.id)
        nextSamps[s.id] = {
          rows: existing ? (sampleRowsByReport.get(existing.id) ?? []) : [],
          layout: existing?.sampling_layout_done ?? false,
          reportId: existing?.id ?? null,
          locked: existing ? !isEditable(existing) : false,
        }
      }
      setGroups(list)
      setDocs(nextDocs)
      setSaws(nextSaws)
      setSamps(nextSamps)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [session, siteId, date, profile, reloadKey])

  // Блоки для текста WhatsApp — из текущего состояния формы
  const blocks: GeologyWellBlock[] = useMemo(() => {
    const typeName = (id: string) => sampleTypes.find((t) => t.id === id)?.name ?? 'проба'
    return groups.map((g) => {
      const docLines = ([
        ['geological', g.geo],
        ['geotechnical', g.geotech],
      ] as const).flatMap(([kind, task]) => {
        if (!task) return []
        const f = docs[task.id]
        if (!f) return []
        const from = num(f.from) ?? 0
        const to = num(f.to)
        const photoDone = num(f.photoTo) != null && (num(f.photoTo) ?? 0) > (num(f.photoFrom) ?? 0)
        if (to == null && !f.finished) return []
        return [{ kind, meters: to != null ? round2(to - from) : 0, total: to ?? from, finished: f.finished, photoDone }]
      })
      const saw = g.sawing ? saws[g.sawing.id] : undefined
      const sawLines = saw
        ? ([
            { shift: 1 as const, meters: num(saw.day) ?? 0 },
            { shift: 2 as const, meters: num(saw.night) ?? 0 },
          ].filter((x) => x.meters > 0))
        : []
      const samp = g.sampling ? samps[g.sampling.id] : undefined
      return {
        wellLabel: g.label,
        docs: docLines,
        saw: sawLines,
        samples: samp ? samp.rows.map((r) => ({ typeName: typeName(r.typeId), quantity: Number(r.qty) || 0 })) : [],
        layoutDone: samp?.layout ?? false,
      }
    })
  }, [groups, docs, saws, samps, sampleTypes])

  const message = useMemo(() => buildGeologyDayMessage({ date, wells: blocks }), [date, blocks])
  const hasContent = blocks.some((b) => b.docs.length > 0 || b.saw.length > 0 || b.samples.length > 0 || b.layoutDone)

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (profile && profile.role !== 'party_chief') {
    return <p>Сводки вносит только назначенный ответственный.</p>
  }

  function patchDoc(id: string, patch: Partial<DocForm>) {
    setDocs((p) => ({ ...p, [id]: { ...p[id], ...patch } }))
  }
  function patchSaw(id: string, patch: Partial<SawForm>) {
    setSaws((p) => ({ ...p, [id]: { ...p[id], ...patch } }))
  }
  function patchSamp(id: string, patch: Partial<SampForm>) {
    setSamps((p) => ({ ...p, [id]: { ...p[id], ...patch } }))
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Не удалось скопировать — скопируйте текст вручную.')
    }
  }

  // Сохранение: каждая заполненная строка — отдельная строка reports.
  // Вставка/правка — как черновик, затем (при отправке) отдельным запросом
  // смена статуса на submitted: тот же двухшаговый порядок, что и в
  // DailyReportForm (RLS на дочерние таблицы разрешает запись только пока
  // сводка draft).
  async function save(mode: 'draft' | 'submit') {
    if (!profile || busyRef.current) return
    busyRef.current = true
    setBusy(mode)
    setError(null)
    setOkMsg(null)
    const touchedIds: string[] = []

    try {
      const base = { site_id: siteId, author_id: profile.id, report_date: date }

      async function upsert(existingId: string | null, payload: Record<string, unknown>) {
        if (existingId) {
          const { data, error: e } = await supabase.from('reports').update(payload).eq('id', existingId).select('id')
          if (e) throw e
          if (!data || data.length === 0) throw new Error('Сводку нельзя изменить: она уже отправлена или согласована.')
          return existingId
        }
        const { data, error: e } = await supabase
          .from('reports')
          .insert({ ...base, ...payload, approval_status: 'draft' })
          .select('id')
          .single()
        if (e) throw e
        return data.id as string
      }

      for (const g of groups) {
        for (const task of [g.geo, g.geotech]) {
          if (!task) continue
          const f = docs[task.id]
          if (!f || f.locked) continue
          const to = num(f.to)
          if (to == null && !f.finished) continue
          if (to != null && to < (num(f.from) ?? 0)) throw new Error(`Скважина ${g.label}: «до» меньше «от» в документации.`)
          const photoTo = num(f.photoTo)
          const id = await upsert(f.reportId, {
            core_description_task_id: task.id,
            core_description_interval_from: to != null ? (num(f.from) ?? 0) : null,
            core_description_interval_to: to,
            photofixation_interval_from: photoTo != null ? (num(f.photoFrom) ?? 0) : null,
            photofixation_interval_to: photoTo,
            documentation_finished: f.finished,
          })
          touchedIds.push(id)
        }
        if (g.sawing) {
          const f = saws[g.sawing.id]
          if (f) {
            for (const [shift, value, rid, locked] of [
              [1, f.day, f.dayId, f.dayLocked],
              [2, f.night, f.nightId, f.nightLocked],
            ] as const) {
              if (locked || num(value) == null) continue
              const id = await upsert(rid, { core_sawing_task_id: g.sawing.id, shift_number: shift, sawn_meters: num(value) })
              touchedIds.push(id)
            }
          }
        }
        if (g.sampling) {
          const f = samps[g.sampling.id]
          const valid = f ? f.rows.filter((r) => r.typeId && Number(r.qty) > 0) : []
          if (f && !f.locked && (valid.length > 0 || f.layout)) {
            const total = valid.reduce((s, r) => s + Number(r.qty), 0)
            const id = await upsert(f.reportId, {
              sampling_task_id: g.sampling.id,
              samples_taken: total,
              sampling_layout_done: f.layout,
            })
            const { error: dErr } = await supabase.from('report_samples').delete().eq('report_id', id)
            if (dErr) throw dErr
            if (valid.length > 0) {
              const { error: iErr } = await supabase
                .from('report_samples')
                .insert(valid.map((r) => ({ report_id: id, sample_type_id: r.typeId, quantity: Number(r.qty) })))
              if (iErr) throw iErr
            }
            touchedIds.push(id)
          }
        }
      }

      if (touchedIds.length === 0) {
        throw new Error('Нечего сохранять: заполните хотя бы одну строку.')
      }

      if (mode === 'submit') {
        const { error: sErr } = await supabase
          .from('reports')
          .update({
            approval_status: 'submitted',
            submitted_at: new Date().toISOString(),
            edit_unlocked: false,
            review_comment: null,
          })
          .in('id', touchedIds)
        if (sErr) {
          throw new Error(`Сводка сохранена как черновик, но не отправлена на согласование: ${sErr.message}`)
        }
      }
      setOkMsg(
        mode === 'submit'
          ? `Отправлено на согласование: ${touchedIds.length} ${touchedIds.length === 1 ? 'строка' : 'строк'}. Теперь можно скопировать текст для WhatsApp.`
          : `Черновик сохранён: ${touchedIds.length} ${touchedIds.length === 1 ? 'строка' : 'строк'}.`,
      )
      notifyReportsChanged()
      setReloadKey((k) => k + 1)
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string })?.message
      setError(msg ?? 'Не удалось сохранить')
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  const sectionTitle = (icon: React.ReactNode, text: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 14 }}>
      {icon} {text}
    </div>
  )

  return (
    <div style={{ maxWidth: 760 }}>
      <Link to="/reports/mine" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, marginBottom: 10 }}>
        <ChevronLeft size={15} /> Мои сводки
      </Link>
      <h1 style={{ marginTop: 0 }}>Сводка геологов за день</h1>

      <div className="card" style={{ padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ flex: '1 1 160px' }}>
          Участок
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: '1 1 160px' }}>
          Дата
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-md)' }} />
      ) : groups.length === 0 ? (
        <div className="card" style={{ padding: 18 }}>
          <p style={{ margin: 0 }}>На этом участке для вас нет геологических заданий.</p>
          <p className="text-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            Их назначает руководство: «Участок → + Задание → Геология».
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {groups.map((g) => (
            <section key={g.key} className="card" style={{ padding: 14, display: 'grid', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Скважина {g.label}</h2>

              {([
                ['geological', g.geo, 'Геологическая документация'],
                ['geotechnical', g.geotech, 'Геотехническая документация'],
              ] as const).map(([kind, task, title]) => {
                if (!task) return null
                const f = docs[task.id]
                if (!f) return null
                const meters = f.to !== '' ? round2((num(f.to) ?? 0) - (num(f.from) ?? 0)) : null
                return (
                  <div key={kind} style={{ display: 'grid', gap: 8 }}>
                    {sectionTitle(<Layers size={16} className="text-muted" />, title)}
                    {f.locked && <span className="text-muted" style={{ fontSize: 13 }}>Уже отправлено — изменить нельзя.</span>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <label style={{ flex: '1 1 110px' }}>
                        Керн от, м
                        <input readOnly value={f.from} style={{ background: 'var(--color-surface-muted)' }} />
                      </label>
                      <label style={{ flex: '1 1 110px' }}>
                        Керн до, м
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          disabled={f.locked}
                          value={f.to}
                          onChange={(e) => patchDoc(task.id, { to: e.target.value })}
                        />
                      </label>
                      <label style={{ flex: '1 1 110px' }}>
                        Фото до, м
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          disabled={f.locked}
                          placeholder={`от ${f.photoFrom}`}
                          value={f.photoTo}
                          onChange={(e) => patchDoc(task.id, { photoTo: e.target.value })}
                        />
                      </label>
                    </div>
                    {meters != null && (
                      <span className="text-muted" style={{ fontSize: 13 }}>
                        За день: <b>{meters} м</b>, общий метраж <b>{num(f.to)} м</b>
                      </span>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
                      <input
                        type="checkbox"
                        disabled={f.locked}
                        checked={f.finished}
                        onChange={(e) => patchDoc(task.id, { finished: e.target.checked })}
                        style={{ width: 20, height: 20 }}
                      />
                      Документация закончена
                    </label>
                  </div>
                )
              })}

              {g.sawing && saws[g.sawing.id] && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {sectionTitle(<Scissors size={16} className="text-muted" />, 'Распиловка')}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <label style={{ flex: '1 1 130px' }}>
                      День, м
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        disabled={saws[g.sawing.id].dayLocked}
                        value={saws[g.sawing.id].day}
                        onChange={(e) => patchSaw(g.sawing!.id, { day: e.target.value })}
                      />
                    </label>
                    <label style={{ flex: '1 1 130px' }}>
                      Ночь, м
                      <input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        disabled={saws[g.sawing.id].nightLocked}
                        value={saws[g.sawing.id].night}
                        onChange={(e) => patchSaw(g.sawing!.id, { night: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              )}

              {g.sampling && samps[g.sampling.id] && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {sectionTitle(<FlaskConical size={16} className="text-muted" />, 'Опробование')}
                  {samps[g.sampling.id].locked && (
                    <span className="text-muted" style={{ fontSize: 13 }}>Уже отправлено — изменить нельзя.</span>
                  )}
                  {samps[g.sampling.id].rows.map((row, i) => {
                    const sf = samps[g.sampling!.id]
                    return (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          disabled={sf.locked}
                          value={row.typeId}
                          onChange={(e) =>
                            patchSamp(g.sampling!.id, { rows: sf.rows.map((r, j) => (j === i ? { ...r, typeId: e.target.value } : r)) })
                          }
                          style={{ flex: 2 }}
                        >
                          <option value="">— вид пробы —</option>
                          {sampleTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          placeholder="шт"
                          disabled={sf.locked}
                          value={row.qty}
                          onChange={(e) =>
                            patchSamp(g.sampling!.id, { rows: sf.rows.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)) })
                          }
                          style={{ flex: 1, minWidth: 70 }}
                        />
                        {!sf.locked && (
                          <button
                            type="button"
                            className="icon-btn-round"
                            aria-label="Убрать строку"
                            onClick={() => patchSamp(g.sampling!.id, { rows: sf.rows.filter((_, j) => j !== i) })}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {!samps[g.sampling.id].locked && (
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, justifySelf: 'start' }}
                      onClick={() =>
                        patchSamp(g.sampling!.id, { rows: [...samps[g.sampling!.id].rows, { typeId: sampleTypes[0]?.id ?? '', qty: '' }] })
                      }
                    >
                      <Plus size={15} /> Вид пробы
                    </button>
                  )}
                  {sampleTypes.length === 0 && (
                    <span className="text-muted" style={{ fontSize: 13 }}>
                      Справочник видов проб пуст — попросите руководство добавить виды в «Настройки → Виды проб».
                    </span>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36 }}>
                    <input
                      type="checkbox"
                      disabled={samps[g.sampling.id].locked}
                      checked={samps[g.sampling.id].layout}
                      onChange={(e) => patchSamp(g.sampling!.id, { layout: e.target.checked })}
                      style={{ width: 20, height: 20 }}
                    />
                    Разбивка на опробование выполнена
                  </label>
                </div>
              )}
            </section>
          ))}

          <section className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 14 }}>Текст для WhatsApp</h2>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                background: 'var(--color-surface-muted)',
                padding: 12,
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {hasContent ? message : 'Заполните данные выше — текст соберётся автоматически.'}
            </pre>
            <button
              type="button"
              className="btn-outline"
              disabled={!hasContent}
              onClick={() => copy(message)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44 }}
            >
              {copied ? <Check size={16} /> : <MessageCircle size={16} />}
              {copied ? 'Скопировано' : 'Скопировать для WhatsApp'}
            </button>
          </section>

          {error && <p className="text-error" style={{ margin: 0 }}>{error}</p>}
          {okMsg && <p className="text-success" style={{ margin: 0, fontWeight: 600 }}>{okMsg}</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-outline" disabled={busy !== null} onClick={() => save('draft')} style={{ minHeight: 44 }}>
              {busy === 'draft' ? 'Сохраняем…' : 'Сохранить черновик'}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => save('submit')} style={{ minHeight: 44 }}>
              {busy === 'submit' ? 'Отправляем…' : 'Отправить на согласование'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
