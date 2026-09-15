import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { createAuxSupabaseClient } from '../../lib/supabaseAuxClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement, ROLE_LABELS, type UserRole } from '../../types/roles'
import type { Profile } from '../../types/database'

const ROLE_OPTIONS: UserRole[] = [
  'general_director',
  'technical_director',
  'party_chief',
]

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
      <h1>Пользователи</h1>

      <form
        onSubmit={handleCreate}
        style={{ display: 'grid', gap: 10, maxWidth: 360, marginBottom: 20 }}
      >
        <h2 style={{ marginBottom: 0 }}>Добавить пользователя</h2>
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

        {formError && <p style={{ color: '#c0392b' }}>{formError}</p>}
        {successMsg && <p style={{ color: '#2e7d32' }}>{successMsg}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Создаём…' : 'Создать пользователя'}
        </button>
      </form>

      <h2>Список пользователей</h2>
      {listError && <p style={{ color: '#c0392b' }}>{listError}</p>}
      {loadingUsers ? (
        <p>Загрузка…</p>
      ) : (
        <ul>
          {users.map((u) => (
            <li key={u.id}>
              {u.full_name} — {ROLE_LABELS[u.role]}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
