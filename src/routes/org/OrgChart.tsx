import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Network, Plus, Trash2, UserCircle2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { OrgPosition, Worker } from '../../types/database'
import Modal from '../../components/Modal'

// Собирает id узла и ВСЕХ его потомков — нужно, чтобы при переносе
// должности в другую ветку нельзя было выбрать самого себя или своего
// же потомка родителем (иначе дерево зациклится).
function collectDescendantIds(rootId: string, all: OrgPosition[]): Set<string> {
  const ids = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const p of all) {
      if (p.parent_id && ids.has(p.parent_id) && !ids.has(p.id)) {
        ids.add(p.id)
        changed = true
      }
    }
  }
  return ids
}

function countDescendants(rootId: string, all: OrgPosition[]): number {
  return collectDescendantIds(rootId, all).size - 1
}

interface NodeProps {
  position: OrgPosition
  childrenByParent: Map<string | null, OrgPosition[]>
  workerName: (id: string | null) => string | null
  onSelect: (p: OrgPosition) => void
}

function OrgNode({ position, childrenByParent, workerName, onSelect }: NodeProps) {
  const kids = childrenByParent.get(position.id) ?? []
  const name = workerName(position.assigned_worker_id)
  return (
    <li>
      <button
        type="button"
        className={`org-node-btn${position.submits_reports ? ' org-node-flagged' : ''}`}
        onClick={() => onSelect(position)}
      >
        <span className="org-node-title">{position.title}</span>
        <span className="org-node-worker">
          {name ?? <span className="text-faint">не назначено</span>}
        </span>
      </button>
      {kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <OrgNode key={k.id} position={k} childrenByParent={childrenByParent} workerName={workerName} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  )
}

// Организационная структура компании (22.09.2026, по запросу владельца
// платформы) — дерево должностей, редактируемое гендиром/техдиром/
// разработчиком (см. is_management(), теперь включает и 'developer').
// Назначение реального человека на должность — из справочника "Работники"
// (workers), не через отдельный список: так решил заказчик, чтобы не
// вести два параллельных реестра людей.
export default function OrgChart() {
  const { session, profile, loading: authLoading } = useAuth()

  const [positions, setPositions] = useState<OrgPosition[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<OrgPosition | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSubmits, setEditSubmits] = useState(false)
  const [editWorkerId, setEditWorkerId] = useState('')
  const [editParentId, setEditParentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [addChildOpen, setAddChildOpen] = useState(false)
  const [childTitle, setChildTitle] = useState('')
  const [childSubmits, setChildSubmits] = useState(false)
  const [addingChild, setAddingChild] = useState(false)
  const [childError, setChildError] = useState<string | null>(null)

  const [addRootOpen, setAddRootOpen] = useState(false)
  const [rootTitle, setRootTitle] = useState('')
  const [addingRoot, setAddingRoot] = useState(false)
  const [rootError, setRootError] = useState<string | null>(null)

  const canEdit = isManagement(profile?.role)

  async function load() {
    setLoading(true)
    const [posRes, workersRes] = await Promise.all([
      supabase.from('org_positions').select('*').order('sort_order'),
      supabase.from('workers').select('*').order('full_name'),
    ])
    if (posRes.error) setError(posRes.error.message)
    setPositions(posRes.data ?? [])
    setWorkers(workersRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (session) load()
  }, [session])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />

  const childrenByParent = new Map<string | null, OrgPosition[]>()
  for (const p of positions) {
    const list = childrenByParent.get(p.parent_id) ?? []
    list.push(p)
    childrenByParent.set(p.parent_id, list)
  }
  const roots = childrenByParent.get(null) ?? []

  const workerName = (id: string | null) => {
    if (!id) return null
    const w = workers.find((x) => x.id === id)
    return w ? `${w.full_name}${w.position ? ` — ${w.position}` : ''}` : null
  }

  function openNode(p: OrgPosition) {
    setSelected(p)
    setEditTitle(p.title)
    setEditSubmits(p.submits_reports)
    setEditWorkerId(p.assigned_worker_id ?? '')
    setEditParentId(p.parent_id ?? '')
    setSaveError(null)
    setConfirmingDelete(false)
    setAddChildOpen(false)
    setChildTitle('')
    setChildSubmits(false)
    setChildError(null)
  }

  function closeNode() {
    setSelected(null)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    setSaveError(null)
    const { data, error: updateError } = await supabase
      .from('org_positions')
      .update({
        title: editTitle.trim(),
        submits_reports: editSubmits,
        assigned_worker_id: editWorkerId || null,
        parent_id: editParentId || null,
      })
      .eq('id', selected.id)
      .select()
      .single()
    if (updateError) {
      setSaveError(updateError.message)
      setSaving(false)
      return
    }
    setPositions((prev) => prev.map((p) => (p.id === data.id ? data : p)))
    setSelected(data)
    setSaving(false)
  }

  async function handleAddChild(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    setAddingChild(true)
    setChildError(null)
    const siblingCount = (childrenByParent.get(selected.id) ?? []).length
    const { data, error: insertError } = await supabase
      .from('org_positions')
      .insert({
        parent_id: selected.id,
        title: childTitle.trim(),
        submits_reports: childSubmits,
        sort_order: siblingCount,
      })
      .select()
      .single()
    if (insertError) {
      setChildError(insertError.message)
      setAddingChild(false)
      return
    }
    setPositions((prev) => [...prev, data])
    setChildTitle('')
    setChildSubmits(false)
    setAddingChild(false)
    setAddChildOpen(false)
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    const descendantIds = collectDescendantIds(selected.id, positions)
    const { data: deletedRows, error: deleteError } = await supabase
      .from('org_positions')
      .delete()
      .eq('id', selected.id)
      .select('id')
    setDeleting(false)
    if (deleteError) {
      setSaveError(deleteError.message)
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      setSaveError('Не удалось удалить — попробуйте обновить страницу.')
      return
    }
    // on delete cascade сносит и потомков в базе — синхронизируем локально,
    // не дожидаясь перезагрузки всего списка.
    setPositions((prev) => prev.filter((p) => !descendantIds.has(p.id)))
    setSelected(null)
  }

  async function handleAddRoot(e: FormEvent) {
    e.preventDefault()
    setAddingRoot(true)
    setRootError(null)
    const { data, error: insertError } = await supabase
      .from('org_positions')
      .insert({ title: rootTitle.trim(), sort_order: roots.length })
      .select()
      .single()
    if (insertError) {
      setRootError(insertError.message)
      setAddingRoot(false)
      return
    }
    setPositions((prev) => [...prev, data])
    setRootTitle('')
    setAddingRoot(false)
    setAddRootOpen(false)
  }

  const excludedForParent = selected ? collectDescendantIds(selected.id, positions) : new Set<string>()
  const parentOptions = positions.filter((p) => !excludedForParent.has(p.id))
  const childCount = selected ? countDescendants(selected.id, positions) : 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
          <Network size={22} className="text-muted" /> Оргструктура
        </h1>
        {canEdit && (
          <button
            type="button"
            onClick={() => setAddRootOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            <Plus size={16} /> Добавить корневую должность
          </button>
        )}
      </div>
      <p className="text-muted" style={{ marginBottom: 22 }}>
        Иерархия должностей компании. Кликните на должность, чтобы назначить человека
        {canEdit ? ', изменить или добавить подчинённую.' : '.'}
        {' '}Оранжевая рамка — держатель должности реально отправляет сводки в системе.
      </p>

      {error && <p className="text-error">{error}</p>}

      {loading ? (
        <div className="skeleton" style={{ height: 300, borderRadius: 'var(--radius-md)' }} />
      ) : roots.length === 0 ? (
        <p className="text-muted">Оргструктура пока пуста.</p>
      ) : (
        <div className="org-tree-wrap">
          <ul className="org-tree">
            {roots.map((r) => (
              <OrgNode key={r.id} position={r} childrenByParent={childrenByParent} workerName={workerName} onSelect={openNode} />
            ))}
          </ul>
        </div>
      )}

      <Modal open={addRootOpen} onClose={() => setAddRootOpen(false)} title="Новая корневая должность">
        <form onSubmit={handleAddRoot} style={{ display: 'grid', gap: 10 }}>
          <input
            required
            autoFocus
            placeholder="Название должности"
            value={rootTitle}
            onChange={(e) => setRootTitle(e.target.value)}
          />
          {rootError && <p className="text-error" style={{ margin: 0 }}>{rootError}</p>}
          <button type="submit" disabled={addingRoot}>
            {addingRoot ? 'Добавляем…' : 'Добавить'}
          </button>
        </form>
      </Modal>

      <Modal open={selected != null} onClose={closeNode} title={selected?.title ?? ''}>
        {selected && (
          <div style={{ display: 'grid', gap: 18 }}>
            {canEdit ? (
              <form onSubmit={handleSave} style={{ display: 'grid', gap: 10 }}>
                <label>
                  Название должности
                  <input required value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </label>
                <label>
                  Назначенный работник
                  <select value={editWorkerId} onChange={(e) => setEditWorkerId(e.target.value)}>
                    <option value="">— не назначено —</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.full_name}
                        {w.position ? ` — ${w.position}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Родительская должность
                  <select value={editParentId} onChange={(e) => setEditParentId(e.target.value)}>
                    <option value="">— без родителя (корень) —</option>
                    {parentOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row' }}>
                  <input
                    type="checkbox"
                    checked={editSubmits}
                    onChange={(e) => setEditSubmits(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Держатель должности отправляет сводки в системе
                </label>
                {saveError && <p className="text-error" style={{ margin: 0 }}>{saveError}</p>}
                <button type="submit" disabled={saving}>
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserCircle2 size={18} className="text-muted" />
                {workerName(selected.assigned_worker_id) ?? (
                  <span className="text-muted">Работник не назначен</span>
                )}
              </div>
            )}

            {canEdit && (
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                {addChildOpen ? (
                  <form onSubmit={handleAddChild} style={{ display: 'grid', gap: 8 }}>
                    <input
                      required
                      autoFocus
                      placeholder="Название подчинённой должности"
                      value={childTitle}
                      onChange={(e) => setChildTitle(e.target.value)}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row', fontSize: 13.5 }}>
                      <input
                        type="checkbox"
                        checked={childSubmits}
                        onChange={(e) => setChildSubmits(e.target.checked)}
                        style={{ width: 'auto' }}
                      />
                      Отправляет сводки
                    </label>
                    {childError && <p className="text-error" style={{ fontSize: 13, margin: 0 }}>{childError}</p>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" disabled={addingChild} style={{ flex: 1 }}>
                        {addingChild ? 'Добавляем…' : 'Добавить'}
                      </button>
                      <button type="button" className="btn-outline" onClick={() => setAddChildOpen(false)} style={{ flex: 1 }}>
                        Отмена
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setAddChildOpen(true)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, width: '100%', marginBottom: 10 }}
                  >
                    <Plus size={14} /> Добавить подчинённую должность
                  </button>
                )}

                {!confirmingDelete ? (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setConfirmingDelete(true)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, width: '100%', color: 'var(--color-danger)' }}
                  >
                    <Trash2 size={14} /> Удалить эту должность
                  </button>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <p className="text-error" style={{ fontSize: 13, margin: 0 }}>
                      Удалить безвозвратно{childCount > 0 ? ` вместе с ${childCount} подчинённой(ыми) должностью(ями)` : ''}?
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn-danger"
                        disabled={deleting}
                        onClick={handleDelete}
                        style={{ flex: 1 }}
                      >
                        {deleting ? 'Удаляем…' : 'Да, удалить'}
                      </button>
                      <button
                        type="button"
                        className="btn-outline"
                        disabled={deleting}
                        onClick={() => setConfirmingDelete(false)}
                        style={{ flex: 1 }}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
