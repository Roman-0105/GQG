import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// Офлайн-сессия (ТЗ раздел 6): supabase-js сам кэширует сессию в
// localStorage и переиспользует её при следующем открытии без сети —
// отдельно ничего настраивать здесь не нужно. Полноценная офлайн-работа
// с формами (IndexedDB, очередь синхронизации) — Этап 5.
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Неверный email или пароль'
          : signInError.message,
      )
      return
    }

    navigate('/')
  }

  return (
    <div style={{ maxWidth: 320 }}>
      <h1>Вход в систему</h1>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ display: 'block', width: '100%' }}
          />
        </label>
        {error && <p className="text-error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Входим…' : 'Войти'}
        </button>
      </form>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 16 }}>
        Учётные записи создаёт администратор (гендир/техдир) — открытой
        регистрации нет. Если у вас ещё нет доступа — обратитесь к
        руководителю.
      </p>
    </div>
  )
}
