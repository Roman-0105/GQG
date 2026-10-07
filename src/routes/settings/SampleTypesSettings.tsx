import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, FlaskConical, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { riseIn } from '../../lib/motionVariants'
import Modal from '../../components/Modal'
import type { SampleType } from '../../types/database'

// Справочник видов проб (03.10.2026): геологи выбирают вид при заполнении
// сводки по опробованию. Руководство может добавлять, переименовывать и
// удалять виды. Вид, по которому уже есть пробы в сводках, удалить нельзя
// (внешний ключ restrict) — вместо этого его можно переименовать.
export default function SampleTypesSettings() {
  const { session, profile, loading: authLoading } = useAuth()
  const [types, setTypes] = useState<SampleType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // null — модалка закрыта; 'new' — добавление; иначе редактируемый вид
  const [editing, setEditing] = useState<SampleType | 'new' | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Двухшаговое удаление без window.confirm() — как в остальном проекте.
  const [deleting, setDeleting] = useState<SampleType | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    supabase
      .from('sample_types')
      .select('*')
      .order('name')
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError(err.message)
        else setTypes((data ?? []) as SampleType[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) {
    return <p>Виды проб может настраивать только руководство.</p>
  }

  function openNew() {
    setName('')
    setFormError(null)
    setEditing('new')
  }

  function openEdit(t: SampleType) {
    setName(t.name)
    setFormError(null)
    setEditing(t)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || editing == null) return
    setSaving(true)
    setFormError(null)

    if (editing === 'new') {
      const { data, error: err } = await supabase
        .from('sample_types')
        .insert({ name: trimmed })
        .select()
        .single()
      if (err) {
        setFormError(err.code === '23505' ? 'Такой вид пробы уже есть.' : err.message)
        setSaving(false)
        return
      }
      setTypes((prev) => [...prev, data as SampleType].sort((a, b) => a.name.localeCompare(b.name)))
    } else {
      const { data, error: err } = await supabase
        .from('sample_types')
        .update({ name: trimmed })
        .eq('id', editing.id)
        .select()
      if (err) {
        setFormError(err.code === '23505' ? 'Такой вид пробы уже есть.' : err.message)
        setSaving(false)
        return
      }
      // update без вернувшихся строк = RLS молча ничего не изменила
      if (!data || data.length === 0) {
        setFormError('Не удалось сохранить: нет прав на изменение.')
        setSaving(false)
        return
      }
      setTypes((prev) =>
        prev
          .map((t) => (t.id === editing.id ? ({ ...t, name: trimmed } as SampleType) : t))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    }
    setSaving(false)
    setEditing(null)
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    const { data, error: err } = await supabase
      .from('sample_types')
      .delete()
      .eq('id', deleting.id)
      .select()
    if (err) {
      setDeleteError(
        err.code === '23503'
          ? 'Этот вид уже используется в сводках — удалить нельзя. Его можно переименовать.'
          : err.message,
      )
      setDeleteBusy(false)
      return
    }
    if (!data || data.length === 0) {
      setDeleteError('Не удалось удалить: нет прав на удаление.')
      setDeleteBusy(false)
      return
    }
    setTypes((prev) => prev.filter((t) => t.id !== deleting.id))
    setDeleteBusy(false)
    setDeleting(null)
  }

  return (
    <div>
      <Link
        to="/settings"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, marginBottom: 10 }}
      >
        <ChevronLeft size={15} /> Настройки
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
          <FlaskConical size={22} className="text-muted" /> Виды проб
        </h1>
        <button type="button" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Добавить вид пробы
        </button>
      </div>
      <p className="text-muted" style={{ marginBottom: 22 }}>
        Геологи выбирают вид пробы при заполнении сводки по опробованию (например, «Объёмный вес»).
      </p>

      {error && <p className="text-error">{error}</p>}

      {loading ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-md)', maxWidth: 480 }} />
      ) : types.length === 0 ? (
        <p className="text-muted">Видов проб пока нет. Добавьте первый.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
          {types.map((t, i) => (
            <motion.div
              key={t.id}
              className="card"
              {...riseIn(i, { duration: 0.25, cap: 10, step: 0.03 })}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}
            >
              <span style={{ flex: 1, fontWeight: 600 }}>{t.name}</span>
              <button
                type="button"
                className="icon-btn-round"
                onClick={() => openEdit(t)}
                title="Переименовать"
                aria-label={`Переименовать «${t.name}»`}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="icon-btn-round"
                onClick={() => {
                  setDeleteError(null)
                  setDeleting(t)
                }}
                title="Удалить"
                aria-label={`Удалить «${t.name}»`}
              >
                <Trash2 size={15} />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Новый вид пробы' : 'Переименовать вид пробы'}
      >
        <form onSubmit={handleSave} style={{ display: 'grid', gap: 10 }}>
          <input
            required
            autoFocus
            placeholder="Например: Объёмный вес"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {formError && <p className="text-error" style={{ margin: 0 }}>{formError}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Удалить вид пробы?">
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0 }}>
            Вид «{deleting?.name}» будет удалён из справочника. Если по нему уже есть пробы в сводках,
            удаление будет отклонено.
          </p>
          {deleteError && <p className="text-error" style={{ margin: 0 }}>{deleteError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Удаляем…' : 'Удалить'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setDeleting(null)}>
              Отмена
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
