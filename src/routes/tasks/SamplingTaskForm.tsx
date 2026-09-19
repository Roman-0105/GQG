import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { FlaskConical, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { DrillingOrganization, DrillingTask, Profile } from '../../types/database'

type WellSource = 'own' | 'external'

// Опробование (отбор проб). В отличие от "Описание керна" — ответственного
// назначают явно ВСЕГДА, даже на своей скважине: это может быть отдельная
// бригада, а не буровая (решение заказчика, см. миграцию 0007). taskId в
// URL — режим правки.
export default function SamplingTaskForm() {
  const { siteId, taskId } = useParams<{ siteId: string; taskId?: string }>()
  const isEditMode = Boolean(taskId)
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [wellSource, setWellSource] = useState<WellSource>('own')
  const [ownDrillingTasks, setOwnDrillingTasks] = useState<DrillingTask[]>([])
  const [selectedDrillingTaskId, setSelectedDrillingTaskId] = useState('')
  const [loadingTask, setLoadingTask] = useState(isEditMode)

  const [organizations, setOrganizations] = useState<DrillingOrganization[]>([])
  const [extWellNumber, setExtWellNumber] = useState('')
  const [extOrgId, setExtOrgId] = useState('')

  const [partyChiefs, setPartyChiefs] = useState<Profile[]>([])
  const [assignedPartyChiefId, setAssignedPartyChiefId] = useState('')
  const [description, setDescription] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !siteId) return
    async function loadRefs() {
      const [tasksRes, orgsRes, chiefsRes] = await Promise.all([
        supabase.from('drilling_tasks').select('*').eq('site_id', siteId).order('well_number'),
        supabase.from('drilling_organizations').select('*').order('name'),
        supabase.from('profiles').select('*').eq('role', 'party_chief').order('full_name'),
      ])
      if (tasksRes.data) setOwnDrillingTasks(tasksRes.data)
      if (orgsRes.data) setOrganizations(orgsRes.data)
      if (chiefsRes.data) setPartyChiefs(chiefsRes.data)
    }
    loadRefs()
  }, [session, siteId])

  useEffect(() => {
    if (!session || !taskId) return
    supabase
      .from('sampling_tasks')
      .select('*')
      .eq('id', taskId)
      .single()
      .then(({ data: t }) => {
        if (t) {
          setWellSource(t.drilling_task_id ? 'own' : 'external')
          setSelectedDrillingTaskId(t.drilling_task_id ?? '')
          setExtWellNumber(t.external_well_number ?? '')
          setExtOrgId(t.external_drilling_org_id ?? '')
          setAssignedPartyChiefId(t.assigned_party_chief_id)
          setDescription(t.description ?? '')
        }
        setLoadingTask(false)
      })
  }, [session, taskId])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!siteId) return <p>Не указан участок.</p>
  if (!isManagement(profile?.role)) {
    return <p>{isEditMode ? 'Редактировать' : 'Создавать'} задания могут только гендир/техдир.</p>
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !assignedPartyChiefId) return
    setSubmitting(true)
    setError(null)

    const commonFields = {
      site_id: siteId as string,
      drilling_task_id: wellSource === 'own' ? selectedDrillingTaskId : null,
      external_well_number: wellSource === 'external' ? extWellNumber : null,
      external_drilling_org_id: wellSource === 'external' ? extOrgId || null : null,
      assigned_party_chief_id: assignedPartyChiefId,
      description: description.trim() || null,
    }

    const { error: saveError } = isEditMode
      ? await supabase.from('sampling_tasks').update(commonFields).eq('id', taskId)
      : await supabase.from('sampling_tasks').insert({ ...commonFields, created_by: profile.id })

    setSubmitting(false)

    if (saveError) {
      setError(saveError.message)
      return
    }
    navigate(`/sites/${siteId}`)
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <Link to={`/sites/${siteId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13.5, marginBottom: 10 }}>
        <ChevronLeft size={15} /> Участок
      </Link>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <FlaskConical size={22} className="text-muted" /> {isEditMode ? 'Правка задания: опробование' : 'Новое задание: опробование'}
      </h1>
      {loadingTask ? (
        <p>Загрузка задания…</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
          <fieldset>
            <legend>Скважина</legend>
            <label style={{ display: 'block' }}>
              <input type="radio" checked={wellSource === 'own'} onChange={() => setWellSource('own')} />{' '}
              Своя скважина
            </label>
            <label style={{ display: 'block' }}>
              <input type="radio" checked={wellSource === 'external'} onChange={() => setWellSource('external')} />{' '}
              Скважина подрядчика
            </label>
          </fieldset>

          {wellSource === 'own' ? (
            <label>
              Выбор скважины
              <select
                required
                value={selectedDrillingTaskId}
                onChange={(e) => setSelectedDrillingTaskId(e.target.value)}
              >
                <option value="">— выбрать —</option>
                {ownDrillingTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    Скважина №{t.well_number}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Номер скважины
                <input required value={extWellNumber} onChange={(e) => setExtWellNumber(e.target.value)} />
              </label>
              <label>
                Организация-подрядчик
                <select value={extOrgId} onChange={(e) => setExtOrgId(e.target.value)}>
                  <option value="">— выбрать —</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label>
            Ответственный (вносит сводки по опробованию)
            <select
              required
              value={assignedPartyChiefId}
              onChange={(e) => setAssignedPartyChiefId(e.target.value)}
            >
              <option value="">— выбрать —</option>
              {partyChiefs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Описание задания для бригадира
            <textarea
              rows={3}
              placeholder="Что делать, на что обратить внимание"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          {error && <p className="text-error">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            {submitting && <span className="spinner" style={{ marginRight: 0 }} />}
            {submitting ? 'Сохраняем…' : isEditMode ? 'Сохранить' : 'Создать задание'}
          </button>
        </form>
      )}
    </div>
  )
}
