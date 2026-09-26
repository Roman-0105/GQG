import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UserPlus, Crown, Shield, HardHat, Trash2, Pencil, Briefcase, Network } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { createAuxSupabaseClient } from '../../lib/supabaseAuxClient'
import { grantAccessToWorker } from '../../lib/grantAccess'
import { useAuth } from '../../context/AuthContext'
import { isManagement, ROLE_LABELS, ROLE_OPTIONS, type UserRole } from '../../types/roles'
import { riseIn } from '../../lib/motionVariants'
import { buildPersonNodes, collectDescendantKeys, parsePersonValue, profileValue, reportsToValue } from '../../lib/personRef'
import type { Position, Profile, Worker } from '../../types/database'
import Modal from '../../components/Modal'
import PersonSelect from '../../components/PersonSelect'

// 'developer' сюда не попадёт по факту (RLS не отдаёт такой профиль
// этому экрану вообще, см. миграцию 0012) — запись нужна только чтобы
// удовлетворить Record<UserRole, ...>, иконка никогда не используется.
const ROLE_ICON: Record<UserRole, typeof Crown> = {
  general_director: Crown,
  technical_director: Shield,
  party_chief: HardHat,
  developer: Crown,
}

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

// Управление справочником должностей (25.09.2026, переход оргструктуры на
// person-centric модель — см. CLAUDE.md) — плоский список add/rename, по
// образцу CategoryCard в CostCategoriesSettings.tsx, но без второго
// уровня (у должностей нет вложенных сущностей). Отдельная модалка,
// открывается кнопкой рядом с "Добавить пользователя".
function PositionsManagerModal({
  open,
  onClose,
  positions,
  onPositionsChange,
}: {
  open: boolean
  onClose: () => void
  positions: Position[]
  onPositionsChange: (positions: Position[]) => void
}) {
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError(null)
    const { data, error } = await supabase.from('positions').insert({ name: newName.trim() }).select().single()
    setAdding(false)
    if (error) {
      setAddError(error.code === '23505' ? 'Такая должность уже есть в списке.' : error.message)
      return
    }
    onPositionsChange([...positions, data].sort((a, b) => a.name.localeCompare(b.name)))
    setNewName('')
  }

  function startRename(p: Position) {
    setRenamingId(p.id)
    setRenameValue(p.name)
    setRenameError(null)
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault()
    if (!renamingId) return
    setRenaming(true)
    setRenameError(null)
    const { data, error } = await supabase
      .from('positions')
      .update({ name: renameValue.trim() })
      .eq('id', renamingId)
      .select()
      .single()
    setRenaming(false)
    if (error) {
      setRenameError(error.code === '23505' ? 'Такая должность уже есть в списке.' : error.message)
      return
    }
    onPositionsChange(
      positions.map((p) => (p.id === data.id ? data : p)).sort((a, b) => a.name.localeCompare(b.name)),
    )
    setRenamingId(null)
  }

  return (
    <Modal open={open} onClose={onClose} title="Управление должностями">
      <div style={{ display: 'grid', gap: 14 }}>
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
          Названия должностей — общий список для Пользователей, Работников и
          Оргструктуры. Права доступа они не меняют (за это отвечает роль).
        </p>

        {positions.length === 0 ? (
          <p className="text-muted" style={{ margin: 0 }}>Пока нет ни одной должности.</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {positions.map((p) =>
              renamingId === p.id ? (
                <form key={p.id} onSubmit={handleRename} style={{ display: 'flex', gap: 6 }}>
                  <input
                    autoFocus
                    required
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" disabled={renaming} style={{ fontSize: 13 }}>
                    {renaming ? 'Сохраняем…' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setRenamingId(null)}
                    style={{ fontSize: 13 }}
                  >
                    Отмена
                  </button>
                </form>
              ) : (
                <div
                  key={p.id}
                  className="card"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}
                >
                  <span style={{ fontSize: 14 }}>{p.name}</span>
                  <button
                    type="button"
                    onClick={() => startRename(p)}
                    title="Переименовать"
                    style={{
                      display: 'inline-flex',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      padding: 4,
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
              ),
            )}
            {renameError && <p className="text-error" style={{ fontSize: 12, margin: 0 }}>{renameError}</p>}
          </div>
        )}

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
          <input
            required
            placeholder="Новая должность"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={adding} style={{ whiteSpace: 'nowrap' }}>
            {adding ? 'Добавляем…' : '+ Добавить'}
          </button>
        </form>
        {addError && <p className="text-error" style={{ fontSize: 12, margin: 0 }}>{addError}</p>}
      </div>
    </Modal>
  )
}

// Карточка пользователя со своим состоянием удаления в два шага (тот же
// паттерн, что и у сводок/работников/оргструктуры) — 23.09.2026, по
// запросу заказчика. Удаляет ТОЛЬКО строку profiles (см. подробный
// комментарий в миграции 0014 — саму учётную запись в Supabase Auth с
// фронтенда снести нельзя, нет service_role). Если у пользователя есть
// история (автор сводок, назначен бригадиром и т.п.) — обычный foreign
// key без каскада вернёт понятную ошибку вместо того, чтобы молча
// потерять данные.
// Редактирование ФИО/роли (25.09.2026, по запросу владельца платформы —
// явно ограничено гендиром/техдиром/разработчиком, тем же is_management(),
// что и остальные права на этом экране: отдельная более узкая роль для
// этого действия не заводилась, разработчик сознательно оставлен внутри
// is_management(), как везде в проекте, см. миграцию 0012). RLS
// (`profiles_update_management` из 0012) уже разрешает management менять
// любой профиль, кроме профиля-разработчика — им самим себе редактировать
// можно, гендиру/техдиру редактировать разработчика нельзя (профиль им
// даже не виден). Роль в форме — из того же ROLE_OPTIONS, что и при
// создании: сделать кого-то разработчиком через UI по-прежнему нельзя.
function UserCard({
  user,
  isSelf,
  positions,
  allProfiles,
  workers,
  onDeleted,
  onUpdated,
}: {
  user: Profile
  isSelf: boolean
  positions: Position[]
  allProfiles: Profile[]
  workers: Worker[]
  onDeleted: (id: string) => void
  onUpdated: (user: Profile) => void
}) {
  const RoleIcon = ROLE_ICON[user.role]
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState(user.full_name)
  const [editRole, setEditRole] = useState<UserRole>(
    ROLE_OPTIONS.includes(user.role) ? user.role : ROLE_OPTIONS[0],
  )
  const [editPositionId, setEditPositionId] = useState(user.position_id ?? '')
  const [editReportsTo, setEditReportsTo] = useState(
    reportsToValue(user.reports_to_profile_id, user.reports_to_worker_id),
  )
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  function openEdit() {
    setEditName(user.full_name)
    setEditRole(ROLE_OPTIONS.includes(user.role) ? user.role : ROLE_OPTIONS[0])
    setEditPositionId(user.position_id ?? '')
    setEditReportsTo(reportsToValue(user.reports_to_profile_id, user.reports_to_worker_id))
    setEditError(null)
    setEditOpen(true)
  }

  // Себя и своих подчинённых нельзя назначить себе же руководителем —
  // иначе иерархия зациклится (см. collectDescendantKeys в lib/personRef.ts,
  // обобщение прежней проверки из OrgChart.tsx на объединённый список людей).
  const excludeKeys = collectDescendantKeys(profileValue(user.id), buildPersonNodes(allProfiles, workers))

  async function handleEditSave(e: FormEvent) {
    e.preventDefault()
    setEditSaving(true)
    setEditError(null)
    const reportsTo = parsePersonValue(editReportsTo)
    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: editName.trim(),
        role: editRole,
        position_id: editPositionId || null,
        reports_to_profile_id: reportsTo?.kind === 'profile' ? reportsTo.id : null,
        reports_to_worker_id: reportsTo?.kind === 'worker' ? reportsTo.id : null,
      })
      .eq('id', user.id)
      .select()
      .single()
    setEditSaving(false)
    if (updateError) {
      setEditError(updateError.message)
      return
    }
    onUpdated(data)
    setEditOpen(false)
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    const { data: deletedRows, error: deleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id)
      .select('id')
    setDeleting(false)
    if (deleteError) {
      setError(
        deleteError.code === '23503'
          ? 'Нельзя удалить — у пользователя есть сводки или он назначен на задания. Сначала переназначьте их другому человеку.'
          : deleteError.message,
      )
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      setError('Не удалось удалить — попробуйте обновить страницу.')
      return
    }
    onDeleted(user.id)
  }

  return (
    <motion.div
      className="card"
      {...riseIn(0, { duration: 0.25 })}
      style={{ padding: '10px 14px', display: 'grid', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="user-avatar">{initials(user.full_name)}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.full_name}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            <RoleIcon size={12} /> {ROLE_LABELS[user.role]}
          </span>
        </span>
        {!confirming && (
          <button
            type="button"
            onClick={openEdit}
            title="Редактировать пользователя"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 'var(--radius-full)',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted)',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <Pencil size={14} />
          </button>
        )}
        {!isSelf && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title="Удалить пользователя"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 'var(--radius-full)',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-danger)',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Редактировать пользователя">
        <form onSubmit={handleEditSave} style={{ display: 'grid', gap: 12 }}>
          <label>
            ФИО
            <input
              autoFocus
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <label>
            Роль
            <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Должность
            <select value={editPositionId} onChange={(e) => setEditPositionId(e.target.value)}>
              <option value="">— не указана —</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {positions.length === 0 && (
            <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
              Пока нет ни одной должности — добавьте через «Управление должностями».
            </p>
          )}
          <label>
            Руководитель
            <PersonSelect
              profiles={allProfiles}
              workers={workers}
              value={editReportsTo}
              onChange={setEditReportsTo}
              excludeKeys={excludeKeys}
              noneLabel="— не назначен —"
            />
          </label>
          {editError && <p className="text-error" style={{ margin: 0 }}>{editError}</p>}
          <button type="submit" disabled={editSaving}>
            {editSaving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </form>
      </Modal>

      {confirming && (
        <div style={{ display: 'grid', gap: 6 }}>
          {error && <p className="text-error" style={{ fontSize: 12, margin: 0 }}>{error}</p>}
          <p style={{ fontSize: 12, margin: 0, color: 'var(--color-text-muted)' }}>
            Удалить пользователя безвозвратно?
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn-danger"
              disabled={deleting}
              onClick={handleDelete}
              style={{ flex: 1, fontSize: 12.5 }}
            >
              {deleting ? 'Удаляем…' : 'Да, удалить'}
            </button>
            <button
              type="button"
              className="btn-outline"
              disabled={deleting}
              onClick={() => setConfirming(false)}
              style={{ flex: 1, fontSize: 12.5 }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default function UsersList() {
  const { session, profile, loading: authLoading } = useAuth()

  const [users, setUsers] = useState<Profile[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [positionsOpen, setPositionsOpen] = useState(false)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('party_chief')
  const [positionId, setPositionId] = useState('')
  const [reportsTo, setReportsTo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  // "Существующий работник" (25.09.2026) — выдать доступ уже заведённому
  // в "Работниках" человеку вместо повторного ввода ФИО с нуля, см.
  // grantAccess.ts. 'scratch' — прежний путь, ничего не меняется.
  const [createMode, setCreateMode] = useState<'scratch' | 'existing'>('scratch')
  const [existingWorkerId, setExistingWorkerId] = useState('')

  async function loadUsers() {
    setLoadingUsers(true)
    const [usersRes, positionsRes, workersRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('positions').select('*').order('name'),
      supabase.from('workers').select('*').order('full_name'),
    ])
    if (usersRes.error) setListError(usersRes.error.message)
    else setUsers(usersRes.data ?? [])
    setPositions(positionsRes.data ?? [])
    setWorkers(workersRes.data ?? [])
    setLoadingUsers(false)
  }

  useEffect(() => {
    if (session) loadUsers()
  }, [session])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) {
    return <p>Управлять пользователями могут только гендир/техдир.</p>
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setSuccessMsg(null)

    const reportsToNew = parsePersonValue(reportsTo)

    if (createMode === 'existing') {
      const worker = workers.find((w) => w.id === existingWorkerId)
      if (!worker) {
        setFormError('Выберите работника из списка.')
        setSubmitting(false)
        return
      }
      const result = await grantAccessToWorker({
        worker,
        email,
        password,
        role,
        positionId: positionId || null,
        reportsToProfileId: reportsToNew?.kind === 'profile' ? reportsToNew.id : null,
        reportsToWorkerId: reportsToNew?.kind === 'worker' ? reportsToNew.id : null,
      })
      if ('error' in result) {
        setFormError(result.error)
        setSubmitting(false)
        return
      }
    } else {
      // Изолированный клиент — регистрация нового сотрудника не должна
      // затронуть текущую сессию гендира (см. lib/supabaseAuxClient.ts).
      const auxClient = createAuxSupabaseClient()
      const { data: signUpData, error: signUpError } =
        await auxClient.auth.signUp({ email, password })

      if (signUpError || !signUpData.user) {
        setFormError(signUpError?.message ?? 'Не удалось создать учётную запись')
        setSubmitting(false)
        return
      }

      // Профиль создаём уже от имени гендира (основной, авторизованный
      // клиент) — RLS разрешает это только management.
      const { error: profileError } = await supabase.from('profiles').insert({
        id: signUpData.user.id,
        full_name: fullName,
        role,
        position_id: positionId || null,
        reports_to_profile_id: reportsToNew?.kind === 'profile' ? reportsToNew.id : null,
        reports_to_worker_id: reportsToNew?.kind === 'worker' ? reportsToNew.id : null,
      })

      if (profileError) {
        setFormError(
          `Учётная запись создана, но не удалось сохранить профиль: ${profileError.message}`,
        )
        setSubmitting(false)
        return
      }
    }

    setSuccessMsg(
      `Пользователь создан. Сообщите ему email и пароль отдельно (лично/мессенджером) — здесь они не сохраняются.`,
    )
    setFullName('')
    setEmail('')
    setPassword('')
    setRole('party_chief')
    setPositionId('')
    setReportsTo('')
    setCreateMode('scratch')
    setExistingWorkerId('')
    setSubmitting(false)
    loadUsers()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Пользователи</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setPositionsOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            <Briefcase size={16} /> Управление должностями
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            <UserPlus size={16} /> Добавить пользователя
          </button>
        </div>
      </div>
      <p className="text-muted" style={{ marginBottom: 22 }}>
        Учётные записи, права доступа, должности и иерархия подчинения.{' '}
        <Link to="/org-chart">
          <Network size={12} style={{ verticalAlign: -1 }} /> Оргструктура
        </Link>{' '}
        рисует то же самое в виде схемы — правки синхронизированы в обе стороны.
      </p>

      <PositionsManagerModal
        open={positionsOpen}
        onClose={() => setPositionsOpen(false)}
        positions={positions}
        onPositionsChange={setPositions}
      />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Добавить пользователя">
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          className={createMode === 'scratch' ? '' : 'btn-outline'}
          onClick={() => setCreateMode('scratch')}
          style={{ flex: 1, fontSize: 13 }}
        >
          Новый человек
        </button>
        <button
          type="button"
          className={createMode === 'existing' ? '' : 'btn-outline'}
          onClick={() => setCreateMode('existing')}
          style={{ flex: 1, fontSize: 13 }}
        >
          Существующий работник
        </button>
      </div>
      <form
        onSubmit={handleCreate}
        style={{ display: 'grid', gap: 12 }}
      >
        {createMode === 'existing' ? (
          <label>
            Работник
            <select
              required
              value={existingWorkerId}
              onChange={(e) => {
                const id = e.target.value
                setExistingWorkerId(id)
                const worker = workers.find((w) => w.id === id)
                if (worker) {
                  setPositionId(worker.position_id ?? '')
                  setReportsTo(reportsToValue(worker.reports_to_profile_id, worker.reports_to_worker_id))
                }
              }}
            >
              <option value="">— выбрать —</option>
              {workers
                .filter((w) => !w.archived_at && !users.some((u) => u.person_id === w.id))
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <label>
            ФИО
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Временный пароль
          <input
            type="text"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Роль
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Должность
          <select value={positionId} onChange={(e) => setPositionId(e.target.value)}>
            <option value="">— не указана —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Руководитель
          <PersonSelect
            profiles={users}
            workers={workers}
            value={reportsTo}
            onChange={setReportsTo}
            noneLabel="— не назначен —"
          />
        </label>

        {formError && <p className="text-error">{formError}</p>}
        {successMsg && <p className="text-success">{successMsg}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
        >
          {submitting ? <span className="spinner" style={{ marginRight: 0 }} /> : <UserPlus size={16} />}
          {submitting ? 'Создаём…' : 'Создать пользователя'}
        </button>
      </form>
      </Modal>

      <h2>Список пользователей</h2>
      {listError && <p className="text-error">{listError}</p>}
      {loadingUsers ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {users.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              isSelf={u.id === profile?.id}
              positions={positions}
              allProfiles={users}
              workers={workers}
              onDeleted={(id) => setUsers((prev) => prev.filter((x) => x.id !== id))}
              onUpdated={(updated) =>
                setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
