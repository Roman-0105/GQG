import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, ArrowRight, Mountain } from 'lucide-react'
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
    <div style={{ maxWidth: 380, margin: '0 auto', paddingTop: 'clamp(8px, 6vh, 64px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background: 'linear-gradient(155deg, var(--color-primary), var(--color-primary-hover))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          boxShadow: 'var(--shadow-md)',
          marginBottom: 20,
        }}
      >
        <Mountain size={26} strokeWidth={2.2} />
      </motion.div>

      <p className="eyebrow" style={{ marginBottom: 6 }}>
        Учёт буровых и ГРР
      </p>
      <h1 style={{ marginBottom: 6 }}>С возвращением</h1>
      <p className="text-muted" style={{ marginBottom: 24 }}>
        Войдите, чтобы продолжить работу с участками и сводками.
      </p>

      <motion.form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gap: 14 }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <label>
          Email
          <div style={{ position: 'relative' }}>
            <Mail
              size={17}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-faint)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="you@company.kz"
              style={{ paddingLeft: 38 }}
            />
          </div>
        </label>
        <label>
          Пароль
          <div style={{ position: 'relative' }}>
            <Lock
              size={17}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-faint)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{ paddingLeft: 38 }}
            />
          </div>
        </label>
        {error && <p className="text-error">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          {loading ? (
            <span className="spinner" style={{ marginRight: 0 }} />
          ) : (
            <ArrowRight size={16} strokeWidth={2.4} />
          )}
          {loading ? 'Входим…' : 'Войти'}
        </button>
      </motion.form>

      <p className="text-muted" style={{ fontSize: 13, marginTop: 20 }}>
        Учётные записи создаёт администратор (гендир/техдир) — открытой
        регистрации нет. Если у вас ещё нет доступа — обратитесь к
        руководителю.
      </p>
    </div>
  )
}
