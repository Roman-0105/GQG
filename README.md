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

См. `.env.example`. Значения берутся в Supabase: Project Settings → API.

Для автодеплоя те же значения нужно добавить как секреты репозитория:
`Settings → Secrets and variables → Actions → New repository secret`
— `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

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
