import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UserPlus, Crown, Shield, HardHat } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { createAuxSupabaseClient } from '../../lib/supabaseAuxClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement, ROLE_LABELS, type UserRole } from '../../types/roles'
import type { Profile } from '../../types/database'
import Modal from '../../components/Modal'

const ROLE_OPTIONS: UserRole[] = [
  'general_director',
  'technical_director',
  'party_chief',
]

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

export default function UsersList() {
  const { session, profile, loading: authLoading } = useAuth()

  const [users, setUsers] = useState<Profile[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('party_chief')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  async function loadUsers() {
    setLoadingUsers(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name')
    if (error) setListError(error.message)
    else setUsers(data ?? [])
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
    })

    if (profileError) {
      setFormError(
        `Учётная запись создана, но не удалось сохранить профиль: ${profileError.message}`,
      )
      setSubmitting(false)
      return
    }

    setSuccessMsg(
      `Пользователь создан. Сообщите ему email и пароль отдельно (лично/мессенджером) — здесь они не сохраняются.`,
    )
    setFullName('')
    setEmail('')
    setPassword('')
    setRole('party_chief')
    setSubmitting(false)
    loadUsers()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Пользователи</h1>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
        >
          <UserPlus size={16} /> Добавить пользователя
        </button>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Добавить пользователя">
      <form
        onSubmit={handleCreate}
        style={{ display: 'grid', gap: 12 }}
      >
        <label>
          ФИО
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
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
          {users.map((u, i) => {
            const RoleIcon = ROLE_ICON[u.role]
            return (
              <motion.div
                key={u.id}
                className="card"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}
              >
                <span className="user-avatar">{initials(u.full_name)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.full_name}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                    <RoleIcon size={12} /> {ROLE_LABELS[u.role]}
                  </span>
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
