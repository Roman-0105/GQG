# Образ веб-панели/полевого PWA КЕРН — статическая сборка Vite,
# отданная через nginx.
#
# Важно про VITE_API_URL: Vite подставляет значения import.meta.env.*
# в JS-бандл НА ЭТАПЕ СБОРКИ, а не при старте контейнера. Поэтому адрес
# API передаётся как build ARG, а не runtime environment — если адрес
# сервера изменится (например, поменяли LAN IP), веб-образ нужно
# пересобрать (`docker compose build web`), одного `docker compose
# restart web` недостаточно. Это явно описано в docs/ops-runbook.md.
#
# Собирается из корня монорепозитория по той же причине, что и
# apps/api/Dockerfile — общий package-lock.json на весь workspace.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM deps AS build
COPY apps/web ./apps/web
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build --workspace apps/web

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
