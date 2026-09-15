# GQS — платформа учёта буровых работ

Веб-платформа (PWA) для учёта буровых работ и описания керна. Работает на ПК и смартфонах (Android/iPhone), включая офлайн-режим.

Стек: React + TypeScript + Vite, Supabase (Postgres + Auth), деплой — GitHub Pages через GitHub Actions.

## Статус проекта

Идёт Этап 1 (инфраструктура) по плану разработки. Полное ТЗ — во внутренней переписке с заказчиком, актуальная версия v0.7.

## Запуск локально

```bash
npm install
cp .env.example .env   # заполнить своими значениями из Supabase
npm run dev
```

## Переменные окружения

См. `.env.example`. Значения берутся в Supabase: **Settings → API Keys**.
Используем **Publishable key** (`sb_publishable_...`) — актуальный (2026)
клиентский ключ, пришедший на смену устаревающему `anon` key. **Secret/
service_role ключи в этот проект никогда не добавляются** — они дают
полный доступ к БД в обход RLS и предназначены только для backend,
которого у нас нет (GitHub Pages — статический хостинг).

Для автодеплоя те же значения нужно добавить как секреты репозитория:
`Settings → Secrets and variables → Actions → New repository secret`
— `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Деплой

Пуш в `main` автоматически собирает и публикует сайт на GitHub Pages
(см. `.github/workflows/deploy.yml`). Перед первым деплоем один раз включить
Pages: `Settings → Pages → Source: GitHub Actions`.

## Структура

```
src/
  lib/            — клиент Supabase
  context/        — авторизация и роли (AuthProvider)
  types/          — роли и общие типы
  routes/
    sites/        — экраны участков работ
    tasks/        — создание заданий (бурение / описание керна)
    reports/      — ежедневные/посменные сводки
```

## Роли

- Генеральный директор
- Технический директор (права идентичны гендиру)
- Начальник буровой партии (бригадир)

Подробности прав доступа и структура данных — см. ТЗ.
