import { Routes, Route } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { AuthProvider } from './context/AuthContext'
import { isSupabaseConfigured } from './lib/supabaseClient'
import AppShell from './components/layout/AppShell'
import Login from './routes/Login'
import Dashboard from './routes/Dashboard'
import SitesList from './routes/sites/SitesList'
import SiteDetail from './routes/sites/SiteDetail'
import DrillingTaskForm from './routes/tasks/DrillingTaskForm'
import CoreDescriptionTaskForm from './routes/tasks/CoreDescriptionTaskForm'
import CoreSawingTaskForm from './routes/tasks/CoreSawingTaskForm'
import SamplingTaskForm from './routes/tasks/SamplingTaskForm'
import DailyReportForm from './routes/reports/DailyReportForm'
import TaskReportsList from './routes/reports/TaskReportsList'
import ReportDetail from './routes/reports/ReportDetail'
import PendingApprovals from './routes/reports/PendingApprovals'
import MyReports from './routes/reports/MyReports'
import ReportReview from './routes/reports/ReportReview'
import SummaryReport from './routes/reports/SummaryReport'
import TaskDashboard from './routes/tasks/TaskDashboard'
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
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--color-danger)',
            color: '#fff',
            padding: '10px 20px',
            fontSize: 13.5,
            position: 'relative',
            zIndex: 50,
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>
            <b>Supabase не настроен</b>: не заданы или некорректны
            VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (подробности —
            в консоли браузера). Приложение работает без подключения к базе.
            Проверьте .env (локально) или секреты репозитория (GitHub Pages).
          </span>
        </div>
      )}
      <AppShell>
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
            path="/sites/:siteId/tasks/core-sawing/new"
            element={<CoreSawingTaskForm />}
          />
          <Route
            path="/sites/:siteId/tasks/sampling/new"
            element={<SamplingTaskForm />}
          />
          <Route
            path="/sites/:siteId/tasks/drilling/:taskId/edit"
            element={<DrillingTaskForm />}
          />
          <Route
            path="/sites/:siteId/tasks/core-description/:taskId/edit"
            element={<CoreDescriptionTaskForm />}
          />
          <Route
            path="/sites/:siteId/tasks/core-sawing/:taskId/edit"
            element={<CoreSawingTaskForm />}
          />
          <Route
            path="/sites/:siteId/tasks/sampling/:taskId/edit"
            element={<SamplingTaskForm />}
          />
          <Route
            path="/tasks/:taskType/:taskId/dashboard"
            element={<TaskDashboard />}
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
            path="/tasks/:taskType/:taskId/reports/:reportId"
            element={<ReportDetail />}
          />
          <Route
            path="/tasks/:taskType/:taskId/reports/:reportId/edit"
            element={<DailyReportForm />}
          />
          <Route path="/reports/mine" element={<MyReports />} />
          <Route path="/reports/pending" element={<PendingApprovals />} />
          <Route path="/reports/:reportId/review" element={<ReportReview />} />
          <Route path="/reports/summary" element={<SummaryReport />} />
        </Routes>
      </AppShell>
    </AuthProvider>
  )
}

export default App
