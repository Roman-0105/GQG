import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useAnimationControls } from 'framer-motion'
import { ArrowRight, BarChart3, ClipboardCheck, Eye, EyeOff, Lock, Mail, Map as MapIcon, TriangleAlert } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// Экран входа (05.10.2026, редизайн под логотип GEO QUEST GROUP).
// ПК: слева фирменная панель (логотип, медленно вращающаяся роза ветров и
// «контурные линии» на фоне), справа форма. Телефон: сверху компактная шапка с
// логотипом, форма карточкой. Анимации отключаются при prefers-reduced-motion.
//
// Офлайн-сессия (ТЗ раздел 6): supabase-js сам кэширует сессию в localStorage —
// отдельно ничего настраивать здесь не нужно.
const LAST_EMAIL_KEY = 'gqg-last-email'

function readLastEmail() {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

// Фон фирменной панели: роза ветров + меридианы и «контуры рельефа».
function Backdrop() {
  const star = '300,28 316,284 572,300 316,316 300,572 284,316 28,300 284,284'
  return (
    <svg className="login-backdrop" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g className="login-contours" fill="none">
        <path d="M-20 430 C 80 380, 160 470, 270 430 S 470 360, 640 420" />
        <path d="M-20 470 C 90 420, 170 510, 280 470 S 480 400, 640 460" />
        <path d="M-20 510 C 100 460, 180 550, 290 510 S 490 440, 640 500" />
        <path d="M-20 140 C 90 100, 190 180, 300 140 S 500 80, 640 130" />
        <path d="M-20 100 C 80 60, 200 140, 310 100 S 510 40, 640 90" />
      </g>
      <g className="login-rose" fill="none">
        <circle cx="300" cy="300" r="282" />
        <circle cx="300" cy="300" r="212" />
        <circle cx="300" cy="300" r="142" />
        <ellipse cx="300" cy="300" rx="110" ry="282" />
        <ellipse cx="300" cy="300" rx="212" ry="282" />
        <line x1="18" y1="300" x2="582" y2="300" />
        <polygon points={star} className="login-star" />
        <polygon points={star} className="login-star login-star-d" transform="rotate(45 300 300) scale(0.62) translate(185 185)" />
      </g>
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState(readLastEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const shake = useAnimationControls()
  const passwordRef = useRef<HTMLInputElement>(null)

  // Фокус: если e-mail уже подставлен (вход не в первый раз) — сразу в пароль.
  useEffect(() => {
    if (email && passwordRef.current) passwordRef.current.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    if (signInError) {
      setLoading(false)
      setError(signInError.message === 'Invalid login credentials' ? 'Неверный email или пароль' : signInError.message)
      shake.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.45 } })
      return
    }

    try {
      localStorage.setItem(LAST_EMAIL_KEY, email.trim())
    } catch {
      // приватный режим — просто не запоминаем
    }
    // loading не снимаем: дальше показывается заставка, пока грузится профиль
    navigate('/')
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState('CapsLock'))
  }

  const points = [
    { icon: ClipboardCheck, text: 'Сводки за смену и согласование' },
    { icon: BarChart3, text: 'Прогресс бурения и дашборды' },
    { icon: MapIcon, text: 'Карта участков и скважин' },
  ]

  return (
    <div className="login">
      <aside className="login-brand">
        <Backdrop />
        <div className="login-brand-inner">
          <motion.div
            className="login-logo"
            initial={{ opacity: 0, scale: 0.7, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, ease: [0.34, 1.4, 0.64, 1] }}
          >
            <span className="login-logo-halo" />
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="GEO QUEST GROUP" width={220} height={220} draggable={false} />
          </motion.div>

          <motion.div
            className="login-brand-text"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2>Платформа учёта буровых и геологоразведочных работ</h2>
            <p>Всё по участкам, скважинам и сводкам — в одном месте, на ПК и в поле.</p>
          </motion.div>

          <ul className="login-points">
            {points.map((p, i) => (
              <motion.li
                key={p.text}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              >
                <p.icon size={17} strokeWidth={2.1} /> {p.text}
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="login-brand-foot">© GEO QUEST GROUP</div>
      </aside>

      <main className="login-main">
        <motion.div animate={shake} className="login-shake">
          <motion.div
            className="login-card"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              Учёт буровых и ГРР
            </p>
            <h1 style={{ marginBottom: 6 }}>С возвращением</h1>
            <p className="text-muted" style={{ marginBottom: 22 }}>
              Войдите, чтобы продолжить работу с участками и сводками.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
              <label className="login-field">
                Email
                <span className="login-input">
                  <Mail size={17} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                    autoFocus={!email}
                    placeholder="you@company.kz"
                  />
                </span>
              </label>

              <label className="login-field">
                Пароль
                <span className="login-input">
                  <Lock size={17} />
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={onKey}
                    onKeyDown={onKey}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="login-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
                {capsLock && (
                  <span className="login-hint">
                    <TriangleAlert size={13} /> Включён Caps Lock
                  </span>
                )}
              </label>

              {error && (
                <motion.p
                  className="text-error login-error"
                  role="alert"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {error}
                </motion.p>
              )}

              <button type="submit" disabled={loading} className="login-submit">
                {loading ? <span className="spinner" style={{ marginRight: 0 }} /> : <ArrowRight size={16} strokeWidth={2.4} />}
                {loading ? 'Входим…' : 'Войти'}
              </button>
            </form>

            <p className="text-muted" style={{ fontSize: 12.5, marginTop: 18, lineHeight: 1.45 }}>
              Учётные записи создаёт администратор — открытой регистрации нет. Нет доступа? Обратитесь к руководителю.
            </p>
          </motion.div>
        </motion.div>
      </main>
    </div>
  )
}
