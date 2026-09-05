import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Sites } from './pages/Sites';
import { SiteNew } from './pages/SiteNew';
import { SiteDetail } from './pages/SiteDetail';
import { Team } from './pages/Team';
import { Positions } from './pages/Positions';
import { TimesheetForm } from './pages/TimesheetForm';
import { MyTimesheets } from './pages/MyTimesheets';
import { Approvals } from './pages/Approvals';
import { RateRules } from './pages/RateRules';
import { Payroll } from './pages/Payroll';
import { Analytics } from './pages/Analytics';

/** Общая навигационная оболочка для всех приватных экранов (см. components/AppShell.tsx). */
function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

// TODO(frontend-dev, Этап 01+): защитить приватные маршруты проверкой
// авторизации (редирект на /login без токена) — сейчас открыты, чтобы
// показать структуру экранов; сервер всё равно не отдаст данные без
// валидного JWT, так что это только вопрос UX, не безопасности.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route element={<ShellLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sites" element={<Sites />} />
        <Route path="/sites/new" element={<SiteNew />} />
        <Route path="/sites/:id" element={<SiteDetail />} />
        <Route path="/team" element={<Team />} />
        <Route path="/positions" element={<Positions />} />
        <Route path="/timesheets/new" element={<TimesheetForm />} />
        <Route path="/timesheets" element={<MyTimesheets />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/rate-rules" element={<RateRules />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/analytics" element={<Analytics />} />
      </Route>
    </Routes>
  );
}
