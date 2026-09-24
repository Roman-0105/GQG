import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base: '/GQG/' — обязательно для GitHub Pages, т.к. сайт публикуется
// по адресу вида https://<user>.github.io/<репозиторий>/, а не в корне
// домена. ВАЖНО: этот путь должен совпадать с реальным названием
// GitHub-репозитория — сейчас репозиторий всё ещё называется "GQS"
// (см. git remote), поэтому если запушить со значением "/GQG/" БЕЗ
// переименования самого репозитория на GitHub, сайт на GitHub Pages
// перестанет открываться (все ассеты будут запрашиваться по несуществующему
// пути). Переименовать репозиторий нужно отдельно (Settings → Rename на
// GitHub, или `gh repo rename`), это не делается автоматически.
export default defineConfig({
  plugins: [react()],
  base: '/GQG/',
})
