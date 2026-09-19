import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// HashRouter, а не BrowserRouter: GitHub Pages — статический хостинг без
// серверных rewrite-правил. При прямом переходе или обновлении страницы
// на "чистом" пути (например /GQS/login) сервер честно ищет такой файл
// и отдаёт 404 — GitHub Pages не умеет "любой путь -> index.html".
// HashRouter кладёт весь маршрут после "#", это всегда один и тот же
// файл (index.html) с точки зрения сервера, поэтому обновление страницы
// и прямые ссылки работают предсказуемо. Это же поведение нам и нужно
// для офлайн-режима (Этап 5) — там тоже важно не зависеть от серверной
// маршрутизации.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
