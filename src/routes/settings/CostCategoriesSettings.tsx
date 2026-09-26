import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight, FolderPlus, Pencil, Plus, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { riseIn } from '../../lib/motionVariants'
import type { CostCategory, CostItem } from '../../types/database'
import Modal from '../../components/Modal'

const UNIT_OPTIONS = ['шт', 'л', 'м', 'м³', 'т', 'кг', 'компл.']
const OTHER_UNIT = '__other__'

// Единица измерения существующего вида затрат может быть НЕ из
// UNIT_OPTIONS (заведена вручную как "другая…" раньше) — тогда селект
// нужно сразу переключить на "другая…" и подставить значение в свободное
// поле, а не молча показать первый вариант из списка.
function unitToSelectValue(unit: string | null): { select: string; custom: string } {
  if (unit && UNIT_OPTIONS.includes(unit)) return { select: unit, custom: '' }
  if (unit) return { select: OTHER_UNIT, custom: unit }
  return { select: UNIT_OPTIONS[0], custom: '' }
}

// Мини-форма имя+единица измерения — общая для добавления и переименования
// вида затрат (20.09.2026, по запросу заказчика: нужно было редактировать
// уже существующие статьи, не только заводить новые).
function ItemFields({
  name,
  setName,
  unit,
  setUnit,
  customUnit,
  setCustomUnit,
}: {
  name: string
  setName: (v: string) => void
  unit: string
  setUnit: (v: string) => void
  customUnit: string
  setCustomUnit: (v: string) => void
}) {
  return (
    <>
      <input
        required
        autoFocus
        placeholder="Наименование затрат"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ flex: 1 }}>
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
          <option value={OTHER_UNIT}>другая…</option>
        </select>
        {unit === OTHER_UNIT && (
          <input
            required
            placeholder="ед. изм."
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
            style={{ flex: 1 }}
          />
        )}
      </div>
    </>
  )
}

// Карточка одной категории — список видов затрат внутри (каждый со своей
// кнопкой переименования) + кнопка добавления нового вида, по образцу
// Attached*Card.tsx: сама пишет в базу и сообщает наверх через колбэки,
// без перезагрузки всего списка. Модалка вместо инлайн-формы — см. отзыв
// 19.09.2026.
function CategoryCard({
  category,
  items,
  isOpen,
  onToggle,
  onCategoryUpdated,
  onItemAdded,
  onItemUpdated,
}: {
  category: CostCategory
  items: CostItem[]
  isOpen: boolean
  onToggle: () => void
  onCategoryUpdated: (category: CostCategory) => void
  onItemAdded: (item: CostItem) => void
  onItemUpdated: (item: CostItem) => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState(UNIT_OPTIONS[0])
  const [customUnit, setCustomUnit] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editCategoryOpen, setEditCategoryOpen] = useState(false)
  const [editCategoryName, setEditCategoryName] = useState(category.name)
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryEditError, setCategoryEditError] = useState<string | null>(null)

  const [editingItem, setEditingItem] = useState<CostItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState(UNIT_OPTIONS[0])
  const [editCustomUnit, setEditCustomUnit] = useState('')
  const [savingItem, setSavingItem] = useState(false)
  const [itemEditError, setItemEditError] = useState<string | null>(null)

  async function handleAddItem(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const finalUnit = unit === OTHER_UNIT ? customUnit.trim() : unit

    const { data, error: insertError } = await supabase
      .from('cost_items')
      .insert({ category_id: category.id, name: name.trim(), unit: finalUnit || null })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    onItemAdded(data)
    setName('')
    setUnit(UNIT_OPTIONS[0])
    setCustomUnit('')
    setSubmitting(false)
    setAddOpen(false)
  }

  function openEditCategory() {
    setEditCategoryName(category.name)
    setCategoryEditError(null)
    setEditCategoryOpen(true)
  }

  async function handleEditCategory(e: FormEvent) {
    e.preventDefault()
    setSavingCategory(true)
    setCategoryEditError(null)
    const { data, error: updateError } = await supabase
      .from('cost_categories')
      .update({ name: editCategoryName.trim() })
      .eq('id', category.id)
      .select()
      .single()
    if (updateError) {
      setCategoryEditError(updateError.message)
      setSavingCategory(false)
      return
    }
    onCategoryUpdated(data)
    setSavingCategory(false)
    setEditCategoryOpen(false)
  }

  function openEditItem(item: CostItem) {
    const { select, custom } = unitToSelectValue(item.unit)
    setEditingItem(item)
    setEditName(item.name)
    setEditUnit(select)
    setEditCustomUnit(custom)
    setItemEditError(null)
  }

  async function handleEditItem(e: FormEvent) {
    e.preventDefault()
    if (!editingItem) return
    setSavingItem(true)
    setItemEditError(null)
    const finalUnit = editUnit === OTHER_UNIT ? editCustomUnit.trim() : editUnit
    const { data, error: updateError } = await supabase
      .from('cost_items')
      .update({ name: editName.trim(), unit: finalUnit || null })
      .eq('id', editingItem.id)
      .select()
      .single()
    if (updateError) {
      setItemEditError(updateError.message)
      setSavingItem(false)
      return
    }
    onItemUpdated(data)
    setSavingItem(false)
    setEditingItem(null)
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
            {category.name}
          </span>
        </button>
        <button
          type="button"
          className="icon-btn-round"
          onClick={openEditCategory}
          title="Переименовать категорию"
          style={{ width: 30, height: 30 }}
        >
          <Pencil size={13} />
        </button>
        <span className="badge badge-neutral num">{items.length}</span>
      </div>

      {isOpen && (
        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
          {items.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              В этой категории пока нет видов затрат.
            </p>
          )}
          {items.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              {items.map((it) => (
                <div
                  key={it.id}
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
                  <span style={{ flex: 1 }}>{it.name}</span>
                  {it.unit && <span className="text-muted num">{it.unit}</span>}
                  <button
                    type="button"
                    onClick={() => openEditItem(it)}
                    title="Переименовать вид затрат"
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
            <Plus size={14} /> Добавить вид затрат
          </button>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={`${category.name} — новый вид затрат`}>
        <form onSubmit={handleAddItem} style={{ display: 'grid', gap: 10 }}>
          <ItemFields
            name={name}
            setName={setName}
            unit={unit}
            setUnit={setUnit}
            customUnit={customUnit}
            setCustomUnit={setCustomUnit}
          />
          {error && <p className="text-error" style={{ fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </Modal>

      <Modal open={editCategoryOpen} onClose={() => setEditCategoryOpen(false)} title="Переименовать категорию">
        <form onSubmit={handleEditCategory} style={{ display: 'grid', gap: 10 }}>
          <input
            required
            autoFocus
            placeholder="Название категории"
            value={editCategoryName}
            onChange={(e) => setEditCategoryName(e.target.value)}
          />
          {categoryEditError && <p className="text-error" style={{ fontSize: 13, margin: 0 }}>{categoryEditError}</p>}
          <button type="submit" disabled={savingCategory}>
            {savingCategory ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </Modal>

      <Modal
        open={editingItem != null}
        onClose={() => setEditingItem(null)}
        title={editingItem ? `${category.name} — «${editingItem.name}»` : ''}
      >
        <form onSubmit={handleEditItem} style={{ display: 'grid', gap: 10 }}>
          <ItemFields
            name={editName}
            setName={setEditName}
            unit={editUnit}
            setUnit={setEditUnit}
            customUnit={editCustomUnit}
            setCustomUnit={setEditCustomUnit}
          />
          {itemEditError && <p className="text-error" style={{ fontSize: 13, margin: 0 }}>{itemEditError}</p>}
          <button type="submit" disabled={savingItem}>
            {savingItem ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </Modal>
    </div>
  )
}

// Настройка статей затрат (19.09.2026, по запросу заказчика) — раньше
// категории затрат правились только через SQL/Table Editor (см. CLAUDE.md).
// Теперь двухуровневая структура (категория -> виды затрат внутри неё, у
// каждого своя единица измерения) заводится прямо в приложении. Доступно
// только management — как и остальные справочники (Пользователи), это
// вопрос организации учёта, не полевая работа бригадира.
//
// 20.09.2026 — добавлено переименование уже существующих категорий и видов
// затрат (не только добавление новых): заказчик уже успел завести "ГСМ" и
// хотел без пересоздания переименовать его в "Солярка" и т.п.
export default function CostCategoriesSettings() {
  const { session, profile, loading: authLoading } = useAuth()

  const [categories, setCategories] = useState<CostCategory[]>([])
  const [items, setItems] = useState<CostItem[]>([])
  const [loading, setLoading] = useState(true)
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)

  const [addCategoryOpen, setAddCategoryOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [categoryError, setCategoryError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [catRes, itemsRes] = await Promise.all([
      supabase.from('cost_categories').select('*').order('name'),
      supabase.from('cost_items').select('*').order('name'),
    ])
    setCategories(catRes.data ?? [])
    setItems(itemsRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (session) load()
  }, [session])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) {
    return <p>Статьи затрат может настраивать только гендир/техдир.</p>
  }

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault()
    setAddingCategory(true)
    setCategoryError(null)
    const { data, error } = await supabase
      .from('cost_categories')
      .insert({ name: newCategoryName.trim() })
      .select()
      .single()
    if (error) {
      setCategoryError(error.message)
      setAddingCategory(false)
      return
    }
    setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewCategoryName('')
    setOpenCategoryId(data.id)
    setAddingCategory(false)
    setAddCategoryOpen(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
          <Wallet size={22} className="text-muted" /> Статьи затрат
        </h1>
        <button
          type="button"
          onClick={() => setAddCategoryOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
        >
          <FolderPlus size={16} /> Добавить категорию
        </button>
      </div>
      <p className="text-muted" style={{ marginBottom: 22 }}>
        Категории и виды затрат для сводок. Изменения сразу доступны бригадирам при заполнении затрат.
      </p>

      <Modal open={addCategoryOpen} onClose={() => setAddCategoryOpen(false)} title="Новая категория затрат">
        <form onSubmit={handleAddCategory} style={{ display: 'grid', gap: 10 }}>
          <input
            required
            autoFocus
            placeholder="Название категории"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          {categoryError && <p className="text-error" style={{ margin: 0 }}>{categoryError}</p>}
          <button type="submit" disabled={addingCategory}>
            {addingCategory ? 'Добавляем…' : 'Добавить'}
          </button>
        </form>
      </Modal>

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <p className="text-muted">Категорий затрат пока нет.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
          {categories.map((c, i) => (
            <motion.div key={c.id} {...riseIn(i, { duration: 0.25, cap: 10, step: 0.03 })}>
              <CategoryCard
                category={c}
                items={items.filter((it) => it.category_id === c.id)}
                isOpen={openCategoryId === c.id}
                onToggle={() => setOpenCategoryId((prev) => (prev === c.id ? null : c.id))}
                onCategoryUpdated={(updated) =>
                  setCategories((prev) =>
                    prev.map((cat) => (cat.id === updated.id ? updated : cat)).sort((a, b) => a.name.localeCompare(b.name)),
                  )
                }
                onItemAdded={(item) => setItems((prev) => [...prev, item])}
                onItemUpdated={(updated) =>
                  setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)))
                }
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
