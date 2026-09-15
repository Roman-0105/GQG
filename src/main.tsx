import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// basename совпадает с base в vite.config.ts — обязательно для GitHub Pages,
// сайт публикуется в подпапке /GQS/, а не в корне домена.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/GQS/">
      <App />
    </BrowserRouter>
  </StrictMode>,
)
