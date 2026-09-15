import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../types/roles'

// TODO (Этап 3+): вид зависит от роли — см. ТЗ, раздел 5.
// Гендир/техдир: список участков + сводная статистика.
// Начальник партии: список доступных ему участков/заданий.
export default function Dashboard() {
  const { session, profile, loading, signOut } = useAuth()

  if (loading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />

  if (!profile) {
    return (
      <div>
        <h1>Главный дашборд</h1>
        <p>
          Вы вошли, но для вашей учётной записи ещё не создан профиль с
          ролью. Обратитесь к администратору (см. supabase/README.md,
          раздел про первого пользователя).
        </p>
        <button onClick={signOut}>Выйти</button>
      </div>
    )
  }

  return (
    <div>
      <h1>Главный дашборд</h1>
      <p>
        {profile.full_name} — {ROLE_LABELS[profile.role]}
      </p>
      <button onClick={signOut}>Выйти</button>
    </div>
  )
}
