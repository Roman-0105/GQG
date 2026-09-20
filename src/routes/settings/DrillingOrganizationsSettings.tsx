import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building2, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { DrillingOrganization, DrillingRig } from '../../types/database'
import Modal from '../../components/Modal'

const DRILLING_TYPE_OPTIONS = ['Колонковое', 'Шнековое', 'Роторное', 'Ударно-канатное']
const OTHER_TYPE = '__other__'

// Карточка организации — список станков внутри + кнопка, открывающая
// модалку добавления станка, по образцу CategoryCard в
// CostCategoriesSettings.tsx (см. отзыв 19.09.2026: формы добавления —
// только по клику, во всплывающем окне с заблюренным фоном, не инлайн).
function OrganizationCard({
  organization,
  rigs,
  isOpen,
  onToggle,
  onRigAdded,
}: {
  organization: DrillingOrganization
  rigs: DrillingRig[]
  isOpen: boolean
  onToggle: () => void
  onRigAdded: (rig: DrillingRig) => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [rigNumber, setRigNumber] = useState('')
  const [model, setModel] = useState('')
  const [drillingType, setDrillingType] = useState(DRILLING_TYPE_OPTIONS[0])
  const [customType, setCustomType] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAddRig(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const finalType = drillingType === OTHER_TYPE ? customType.trim() : drillingType

    const { data, error: insertError } = await supabase
      .from('drilling_rigs')
      .insert({
        organization_id: organization.id,
        rig_number: rigNumber.trim(),
        model: model.trim() || null,
        drilling_type: finalType || null,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    onRigAdded(data)
    setRigNumber('')
    setModel('')
    setDrillingType(DRILLING_TYPE_OPTIONS[0])
    setCustomType('')
    setSubmitting(false)
    setAddOpen(false)
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          color: 'var(--color-text)',
          textAlign: 'left',
        }}
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, flex: 1 }}>
          {organization.name}
        </span>
        {organization.is_own && <span className="badge badge-primary">своя</span>}
        <span className="badge badge-neutral num">{rigs.length}</span>
      </button>

      {isOpen && (
        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
          {rigs.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              В этой организации пока нет станков.
            </p>
          )}
          {rigs.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              {rigs.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-muted)',
                    fontSize: 13.5,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="num" style={{ fontWeight: 600 }}>№ {r.rig_number}</span>
                    {r.drilling_type && <span className="text-muted">{r.drilling_type}</span>}
                  </div>
                  {r.model && <span className="text-muted">{r.model}</span>}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="btn-outline"
            onClick={() => setAddOpen(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}
          >
            <Plus size={14} /> Добавить станок
          </button>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={`${organization.name} — новый станок`}>
        <form onSubmit={handleAddRig} style={{ display: 'grid', gap: 10 }}>
          <input
            required
            autoFocus
            placeholder="Номер станка"
            value={rigNumber}
            onChange={(e) => setRigNumber(e.target.value)}
          />
          <input
            placeholder="Марка/модель (например, УРБ-2А2)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={drillingType}
              onChange={(e) => setDrillingType(e.target.value)}
              style={{ flex: 1 }}
            >
              {DRILLING_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value={OTHER_TYPE}>другой…</option>
            </select>
            {drillingType === OTHER_TYPE && (
              <input
                required
                placeholder="вид бурения"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                style={{ flex: 1 }}
              />
            )}
          </div>
          {error && <p className="text-error" style={{ fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

// Организации бурения (свои и подрядные) + станки внутри них (19.09.2026,
// по запросу заказчика) — раньше организация правилась только через
// SQL/Table Editor, а номер станка был свободным текстом на задании.
// Доступно только management, как и остальные справочники.
export default function DrillingOrganizationsSettings() {
  const { session, profile, loading: authLoading } = useAuth()

  const [organizations, setOrganizations] = useState<DrillingOrganization[]>([])
  const [rigs, setRigs] = useState<DrillingRig[]>([])
  const [loading, setLoading] = useState(true)
  const [openOrgId, setOpenOrgId] = useState<string | null>(null)

  const [addOrgOpen, setAddOrgOpen] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [addingOrg, setAddingOrg] = useState(false)
  const [orgError, setOrgError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [orgsRes, rigsRes] = await Promise.all([
      supabase.from('drilling_organizations').select('*').order('name'),
      supabase.from('drilling_rigs').select('*').order('rig_number'),
    ])
    setOrganizations(orgsRes.data ?? [])
    setRigs(rigsRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (session) load()
  }, [session])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) {
    return <p>Организации бурения может настраивать только гендир/техдир.</p>
  }

  async function handleAddOrg(e: FormEvent) {
    e.preventDefault()
    setAddingOrg(true)
    setOrgError(null)
    const { data, error } = await supabase
      .from('drilling_organizations')
      .insert({ name: newOrgName.trim(), is_own: false })
      .select()
      .single()
    if (error) {
      setOrgError(error.message)
      setAddingOrg(false)
      return
    }
    setOrganizations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewOrgName('')
    setOpenOrgId(data.id)
    setAddingOrg(false)
    setAddOrgOpen(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
          <Building2 size={22} className="text-muted" /> Организации бурения
        </h1>
        <button
          type="button"
          onClick={() => setAddOrgOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
        >
          <Plus size={16} /> Добавить организацию
        </button>
      </div>
      <p className="text-muted" style={{ marginBottom: 22 }}>
        Свои и подрядные организации, и буровые станки внутри каждой. Новые организации добавляются как подрядные — «свою» отмечает только владелец платформы.
      </p>

      <Modal open={addOrgOpen} onClose={() => setAddOrgOpen(false)} title="Новая организация бурения">
        <form onSubmit={handleAddOrg} style={{ display: 'grid', gap: 10 }}>
          <input
            required
            autoFocus
            placeholder="Название организации"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
          />
          {orgError && <p className="text-error" style={{ margin: 0 }}>{orgError}</p>}
          <button type="submit" disabled={addingOrg}>
            {addingOrg ? 'Добавляем…' : 'Добавить'}
          </button>
        </form>
      </Modal>

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : organizations.length === 0 ? (
        <p className="text-muted">Организаций пока нет.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
          {organizations.map((o, i) => (
            <motion.div
              key={o.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
            >
              <OrganizationCard
                organization={o}
                rigs={rigs.filter((r) => r.organization_id === o.id)}
                isOpen={openOrgId === o.id}
                onToggle={() => setOpenOrgId((prev) => (prev === o.id ? null : o.id))}
                onRigAdded={(rig) => setRigs((prev) => [...prev, rig])}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
