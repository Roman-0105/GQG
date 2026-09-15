import { Routes, Route, Link } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Login from './routes/Login'
import Dashboard from './routes/Dashboard'
import SitesList from './routes/sites/SitesList'
import SiteDetail from './routes/sites/SiteDetail'
import CreateTask from './routes/tasks/CreateTask'
import DailyReportForm from './routes/reports/DailyReportForm'

// Каркас роутинга по экранам из ТЗ (раздел 5). Защита маршрутов по роли
// (AuthGuard/RequireRole) добавится на Этапе 2, когда появится схема БД
// и таблица profiles с ролями пользователей.
function App() {
  return (
    <AuthProvider>
      <nav style={{ display: 'flex', gap: 12, padding: 12 }}>
        <Link to="/">Дашборд</Link>
        <Link to="/sites">Участки</Link>
        <Link to="/login">Вход</Link>
      </nav>
      <main style={{ padding: 12 }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<SitesList />} />
          <Route path="/sites/:siteId" element={<SiteDetail />} />
          <Route path="/sites/:siteId/tasks/new" element={<CreateTask />} />
          <Route
            path="/tasks/:taskId/reports/new"
            element={<DailyReportForm />}
          />
        </Routes>
      </main>
    </AuthProvider>
  )
}

export default App
