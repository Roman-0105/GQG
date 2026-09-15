import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// base: '/GQS/' — обязательно для GitHub Pages, т.к. сайт публикуется
// по адресу вида https://<user>.github.io/GQS/, а не в корне домена.
export default defineConfig({
  plugins: [react()],
  base: '/GQS/',
})
