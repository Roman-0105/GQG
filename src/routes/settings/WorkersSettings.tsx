import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { HardHat, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { DrillingOrganization, Profile, Worker } from '../../types/database'
import Modal from '../../components/Modal'

// Справочник состава буровых бригад (19.09.2026, по запросу заказчика) —
// отдельно от "Пользователей" (там только те, кто реально логинится).
// Здесь — ФИО/должность/организация + распределение по бригадирам:
// смена бригадира — обычный select на карточке, сохраняется сразу же
// (см. handleReassign), без отдельной формы правки.
export default function WorkersSettings() {
  const { session, profile, loading: authLoading } = useAuth()

  const [workers, setWorkers] = useState<Worker[]>([])
  const [organizations, setOrganizations] = useState<DrillingOrganization[]>([])
  const [foremen, setForemen] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const [addOpen, setAddOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [foremanId, setForemanId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [filterOrgId, setFilterOrgId] = useState('')
  const [filterForemanId, setFilterForemanId] = useState('')

  async function load() {
    setLoading(true)
    const [workersRes, orgsRes, foremenRes] = await Promise.all([
      supabase.from('workers').select('*').order('full_name'),
      supabase.from('drilling_organizations').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'party_chief').order('full_name'),
    ])
    setWorkers(workersRes.data ?? [])
    setOrganizations(orgsRes.data ?? [])
    setForemen(foremenRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (session) load()
  }, [session])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) {
    return <p>Работников может добавлять и распределять только гендир/техдир.</p>
  }

  async function handleAddWorker(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    const { data, error } = await supabase
      .from('workers')
      .insert({
        full_name: fullName.trim(),
        position: position.trim() || null,
        organization_id: organizationId,
        assigned_foreman_id: foremanId || null,
      })
      .select()
      .single()
    if (error) {
      setFormError(error.message)
      setSubmitting(false)
      return
    }
    setWorkers((prev) => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)))
    setFullName('')
    setPosition('')
    setOrganizationId('')
    setForemanId('')
    setSubmitting(false)
    setAddOpen(false)
  }

  async function handleReassign(workerId: string, newForemanId: string) {
    setWorkers((prev) =>
      prev.map((w) => (w.id === workerId ? { ...w, assigned_foreman_id: newForemanId || null } : w)),
    )
    await supabase
      .from('workers')
      .update({ assigned_foreman_id: newForemanId || null })
      .eq('id', workerId)
  }

  const orgName = (id: string) => organizations.find((o) => o.id === id)?.name ?? '—'

  const visibleWorkers = workers.filter((w) => {
    if (filterOrgId && w.organization_id !== filterOrgId) return false
    if (filterForemanId === '__none__' && w.assigned_foreman_id) return false
    if (filterForemanId && filterForemanId !== '__none__' && w.assigned_foreman_id !== filterForemanId)
      return false
    return true
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
          <HardHat size={22} className="text-muted" /> Работники
        </h1>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
        >
          <UserPlus size={16} /> Добавить работника
        </button>
      </div>
      <p className="text-muted" style={{ marginBottom: 22 }}>
        Состав буровых бригад — без входа в приложение, только для учёта и распределения по бригадирам.
      </p>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Добавить работника">
      <form
        onSubmit={handleAddWorker}
        style={{ display: 'grid', gap: 12 }}
      >
        <label>
          ФИО
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>
          Должность
          <input
            placeholder="например, помощник бурильщика"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </label>
        <label>
          Организация
          <select required value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            <option value="">— выбрать —</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Бригадир
          <select value={foremanId} onChange={(e) => setForemanId(e.target.value)}>
            <option value="">— пока не назначен —</option>
            {foremen.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name}
              </option>
            ))}
          </select>
        </label>

        {formError && <p className="text-error">{formError}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
        >
          {submitting ? <span className="spinner" style={{ marginRight: 0 }} /> : <UserPlus size={16} />}
          {submitting ? 'Добавляем…' : 'Добавить работника'}
        </button>
      </form>
      </Modal>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Список работников</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filterOrgId} onChange={(e) => setFilterOrgId(e.target.value)}>
            <option value="">Все организации</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select value={filterForemanId} onChange={(e) => setFilterForemanId(e.target.value)}>
            <option value="">Все бригадиры</option>
            <option value="__none__">— без бригадира —</option>
            {foremen.map((f) => (
              <option key={f.id} value={f.id}>
                {f.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : visibleWorkers.length === 0 ? (
        <p className="text-muted" style={{ marginTop: 12 }}>
          Работников по этому фильтру нет.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gap: 8,
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            marginTop: 12,
          }}
        >
          {visibleWorkers.map((w, i) => (
            <motion.div
              key={w.id}
              className="card"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
              style={{ padding: '10px 14px', display: 'grid', gap: 6 }}
            >
              <div>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{w.full_name}</span>
                <span className="text-muted" style={{ fontSize: 12.5 }}>
                  {w.position ?? '—'} · {orgName(w.organization_id)}
                </span>
              </div>
              <select
                value={w.assigned_foreman_id ?? ''}
                onChange={(e) => handleReassign(w.id, e.target.value)}
                style={{ fontSize: 13 }}
              >
                <option value="">— без бригадира —</option>
                {foremen.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.full_name}
                  </option>
                ))}
              </select>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
