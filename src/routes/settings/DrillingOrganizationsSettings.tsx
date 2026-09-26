import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Building2, ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { riseIn } from '../../lib/motionVariants'
import type { DrillingOrganization, DrillingRig } from '../../types/database'
import Modal from '../../components/Modal'

const DRILLING_TYPE_OPTIONS = ['Колонковое', 'Шнековое', 'Роторное', 'Ударно-канатное']
const OTHER_TYPE = '__other__'

// Вид бурения существующего станка может быть НЕ из DRILLING_TYPE_OPTIONS
// (заведён вручную как "другой…" раньше) — тогда селект нужно сразу
// переключить на "другой…" и подставить значение в свободное поле, не
// молча показывать первый вариант из списка. Тот же приём, что
// unitToSelectValue в CostCategoriesSettings.tsx.
function drillingTypeToSelectValue(type: string | null): { select: string; custom: string } {
  if (type && DRILLING_TYPE_OPTIONS.includes(type)) return { select: type, custom: '' }
  if (type) return { select: OTHER_TYPE, custom: type }
  return { select: DRILLING_TYPE_OPTIONS[0], custom: '' }
}

// Мини-форма номер+модель+вид бурения — общая для добавления и
// редактирования станка (25.09.2026, по запросу владельца: нужно было
// редактировать уже заведённые станки, не только добавлять новые), по
// образцу ItemFields в CostCategoriesSettings.tsx.
function RigFields({
  rigNumber,
  setRigNumber,
  model,
  setModel,
  drillingType,
  setDrillingType,
  customType,
  setCustomType,
}: {
  rigNumber: string
  setRigNumber: (v: string) => void
  model: string
  setModel: (v: string) => void
  drillingType: string
  setDrillingType: (v: string) => void
  customType: string
  setCustomType: (v: string) => void
}) {
  return (
    <>
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
        <select value={drillingType} onChange={(e) => setDrillingType(e.target.value)} style={{ flex: 1 }}>
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
    </>
  )
}

// Карточка организации — список станков внутри (каждый со своей кнопкой
// редактирования) + кнопка добавления нового станка + переименование самой
// организации, по образцу CategoryCard в CostCategoriesSettings.tsx.
// Модалка вместо инлайн-формы — см. отзыв 19.09.2026.
function OrganizationCard({
  organization,
  rigs,
  isOpen,
  onToggle,
  onOrganizationUpdated,
  onRigAdded,
  onRigUpdated,
}: {
  organization: DrillingOrganization
  rigs: DrillingRig[]
  isOpen: boolean
  onToggle: () => void
  onOrganizationUpdated: (organization: DrillingOrganization) => void
  onRigAdded: (rig: DrillingRig) => void
  onRigUpdated: (rig: DrillingRig) => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [rigNumber, setRigNumber] = useState('')
  const [model, setModel] = useState('')
  const [drillingType, setDrillingType] = useState(DRILLING_TYPE_OPTIONS[0])
  const [customType, setCustomType] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editOrgOpen, setEditOrgOpen] = useState(false)
  const [editOrgName, setEditOrgName] = useState(organization.name)
  const [savingOrg, setSavingOrg] = useState(false)
  const [orgEditError, setOrgEditError] = useState<string | null>(null)

  const [editingRig, setEditingRig] = useState<DrillingRig | null>(null)
  const [editRigNumber, setEditRigNumber] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editDrillingType, setEditDrillingType] = useState(DRILLING_TYPE_OPTIONS[0])
  const [editCustomType, setEditCustomType] = useState('')
  const [savingRig, setSavingRig] = useState(false)
  const [rigEditError, setRigEditError] = useState<string | null>(null)

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

  function openEditOrg() {
    setEditOrgName(organization.name)
    setOrgEditError(null)
    setEditOrgOpen(true)
  }

  async function handleEditOrg(e: FormEvent) {
    e.preventDefault()
    setSavingOrg(true)
    setOrgEditError(null)
    const { data, error: updateError } = await supabase
      .from('drilling_organizations')
      .update({ name: editOrgName.trim() })
      .eq('id', organization.id)
      .select()
      .single()
    if (updateError) {
      setOrgEditError(updateError.message)
      setSavingOrg(false)
      return
    }
    onOrganizationUpdated(data)
    setSavingOrg(false)
    setEditOrgOpen(false)
  }

  function openEditRig(rig: DrillingRig) {
    const { select, custom } = drillingTypeToSelectValue(rig.drilling_type)
    setEditingRig(rig)
    setEditRigNumber(rig.rig_number)
    setEditModel(rig.model ?? '')
    setEditDrillingType(select)
    setEditCustomType(custom)
    setRigEditError(null)
  }

  async function handleEditRig(e: FormEvent) {
    e.preventDefault()
    if (!editingRig) return
    setSavingRig(true)
    setRigEditError(null)
    const finalType = editDrillingType === OTHER_TYPE ? editCustomType.trim() : editDrillingType
    const { data, error: updateError } = await supabase
      .from('drilling_rigs')
      .update({
        rig_number: editRigNumber.trim(),
        model: editModel.trim() || null,
        drilling_type: finalType || null,
      })
      .eq('id', editingRig.id)
      .select()
      .single()
    if (updateError) {
      setRigEditError(updateError.message)
      setSavingRig(false)
      return
    }
    onRigUpdated(data)
    setSavingRig(false)
    setEditingRig(null)
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 8px 8px 14px' }}>
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flex: 1,
            minWidth: 0,
            padding: '4px 0',
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text)',
            textAlign: 'left',
          }}
        >
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
            {organization.name}
          </span>
        </button>
        <button
          type="button"
          className="icon-btn-round"
          onClick={openEditOrg}
          title="Переименовать организацию"
          style={{ width: 30, height: 30 }}
        >
          <Pencil size={13} />
        </button>
        {organization.is_own && <span className="badge badge-primary">своя</span>}
        <span className="badge badge-neutral num">{rigs.length}</span>
      </div>

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
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-muted)',
                    fontSize: 13.5,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span className="num" style={{ fontWeight: 600 }}>№ {r.rig_number}</span>
                      {r.drilling_type && <span className="text-muted">{r.drilling_type}</span>}
                    </div>
                    {r.model && <span className="text-muted">{r.model}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditRig(r)}
                    title="Редактировать станок"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 'var(--radius-full)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    <Pencil size={12} />
                  </button>
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
          <RigFields
            rigNumber={rigNumber}
            setRigNumber={setRigNumber}
            model={model}
            setModel={setModel}
            drillingType={drillingType}
            setDrillingType={setDrillingType}
            customType={customType}
            setCustomType={setCustomType}
          />
          {error && <p className="text-error" style={{ fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </Modal>

      <Modal open={editOrgOpen} onClose={() => setEditOrgOpen(false)} title="Переименовать организацию">
        <form onSubmit={handleEditOrg} style={{ display: 'grid', gap: 10 }}>
          <input
            required
            autoFocus
            placeholder="Название организации"
            value={editOrgName}
            onChange={(e) => setEditOrgName(e.target.value)}
          />
          {orgEditError && <p className="text-error" style={{ fontSize: 13, margin: 0 }}>{orgEditError}</p>}
          <button type="submit" disabled={savingOrg}>
            {savingOrg ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </Modal>

      <Modal
        open={editingRig != null}
        onClose={() => setEditingRig(null)}
        title={editingRig ? `${organization.name} — станок № ${editingRig.rig_number}` : ''}
      >
        <form onSubmit={handleEditRig} style={{ display: 'grid', gap: 10 }}>
          <RigFields
            rigNumber={editRigNumber}
            setRigNumber={setEditRigNumber}
            model={editModel}
            setModel={setEditModel}
            drillingType={editDrillingType}
            setDrillingType={setEditDrillingType}
            customType={editCustomType}
            setCustomType={setEditCustomType}
          />
          {rigEditError && <p className="text-error" style={{ fontSize: 13, margin: 0 }}>{rigEditError}</p>}
          <button type="submit" disabled={savingRig}>
            {savingRig ? 'Сохраняем…' : 'Сохранить'}
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
//
// 25.09.2026 — добавлено редактирование уже существующих организаций и
// станков (не только добавление новых), по образцу CostCategoriesSettings.tsx.
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
            <motion.div key={o.id} {...riseIn(i, { duration: 0.25, cap: 10, step: 0.03 })}>
              <OrganizationCard
                organization={o}
                rigs={rigs.filter((r) => r.organization_id === o.id)}
                isOpen={openOrgId === o.id}
                onToggle={() => setOpenOrgId((prev) => (prev === o.id ? null : o.id))}
                onOrganizationUpdated={(updated) =>
                  setOrganizations((prev) =>
                    prev.map((org) => (org.id === updated.id ? updated : org)).sort((a, b) => a.name.localeCompare(b.name)),
                  )
                }
                onRigAdded={(rig) => setRigs((prev) => [...prev, rig])}
                onRigUpdated={(updated) =>
                  setRigs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
                }
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
