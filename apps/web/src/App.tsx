import { Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Sites } from './pages/Sites';
import { TimesheetForm } from './pages/TimesheetForm';

// TODO(frontend-dev, Этап 01): защитить /dashboard, /sites, /timesheets/new
// проверкой авторизации (редирект на /login без токена) — в каркасе
// Этапа 00 маршруты открыты, чтобы показать структуру экранов.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/sites" element={<Sites />} />
      <Route path="/timesheets/new" element={<TimesheetForm />} />
    </Routes>
  );
}
