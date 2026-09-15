import { Routes, Route, Link } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { isSupabaseConfigured } from './lib/supabaseClient'
import Login from './routes/Login'
import Dashboard from './routes/Dashboard'
import SitesList from './routes/sites/SitesList'
import SiteDetail from './routes/sites/SiteDetail'
import DrillingTaskForm from './routes/tasks/DrillingTaskForm'
import CoreDescriptionTaskForm from './routes/tasks/CoreDescriptionTaskForm'
import DailyReportForm from './routes/reports/DailyReportForm'
import TaskReportsList from './routes/reports/TaskReportsList'
import PendingApprovals from './routes/reports/PendingApprovals'
import ReportReview from './routes/reports/ReportReview'
import UsersList from './routes/users/UsersList'

// Каркас роутинга по экранам из ТЗ (раздел 5). Защита маршрутов по роли
// (AuthGuard/RequireRole) добавится позже; пока каждый экран сам проверяет
// profile.role и RLS всё равно не даст сделать лишнее на уровне БД.
function App() {
  return (
    <AuthProvider>
      {!isSupabaseConfigured && (
        <div
          style={{
            background: '#7a1f1f',
            color: '#fff',
            padding: '10px 16px',
            fontSize: 14,
          }}
        >
          ⚠️ Supabase не настроен: не заданы или некорректны
          VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (подробности —
          в консоли браузера). Приложение работает без подключения к базе.
          Проверьте .env (локально) или секреты репозитория (GitHub Pages).
        </div>
      )}
      <nav style={{ display: 'flex', gap: 12, padding: 12 }}>
        <Link to="/">Дашборд</Link>
        <Link to="/sites">Участки</Link>
        <Link to="/users">Пользователи</Link>
        <Link to="/reports/pending">Согласование</Link>
        <Link to="/login">Вход</Link>
      </nav>
      <main style={{ padding: 12 }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<SitesList />} />
          <Route path="/sites/:siteId" element={<SiteDetail />} />
          <Route path="/users" element={<UsersList />} />
          <Route
            path="/sites/:siteId/tasks/drilling/new"
            element={<DrillingTaskForm />}
          />
          <Route
            path="/sites/:siteId/tasks/core-description/new"
            element={<CoreDescriptionTaskForm />}
          />
          <Route
            path="/tasks/:taskType/:taskId/reports"
            element={<TaskReportsList />}
          />
          <Route
            path="/tasks/:taskType/:taskId/reports/new"
            element={<DailyReportForm />}
          />
          <Route
            path="/tasks/:taskType/:taskId/reports/:reportId/edit"
            element={<DailyReportForm />}
          />
          <Route path="/reports/pending" element={<PendingApprovals />} />
          <Route path="/reports/:reportId/review" element={<ReportReview />} />
        </Routes>
      </main>
    </AuthProvider>
  )
}

export default App
