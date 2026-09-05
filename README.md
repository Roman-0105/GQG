# КЕРН

Платформа полевого учёта часов и расчёта заработной платы для
геологических, геотехнических и буровых бригад.

Полное описание идеи, ролевой модели, доменной модели, аналитики и
дорожной карты — в [docs/project-plan.md](docs/project-plan.md).
Архитектурные решения фиксируются в `docs/adr/`.

## Структура репозитория

```
apps/
  api/   — backend: NestJS + PostgreSQL + Prisma
  web/   — веб-панель и полевое PWA: React + Vite + Tailwind
docs/
  project-plan.md   — проектный план
  adr/              — журнал архитектурных решений
.claude/agents/      — команда агентов разработки (см. план, раздел 8)
```

## Что нужно установить

- Node.js LTS (18+): https://nodejs.org
- PostgreSQL 14+ (локально или в Docker)

**Важно:** держите проект в пути без `&`, пробелов в редких edge-case и
других спецсимволов — на Windows `cmd.exe`, через который npm запускает
почти все lifecycle-скрипты и бинарники из `node_modules\.bin`,
воспринимает `&` как разделитель команд и ломает путь (см.
[docs/adr/0002-project-path-and-bcrypt.md](docs/adr/0002-project-path-and-bcrypt.md)).
Отсюда и текущее расположение — `D:\Projects\GQS`, а не `Рабочий стол`
пользователя, чьё имя папки профиля содержит `&`.

## Запуск (после установки Node.js и PostgreSQL)

```bash
npm install
cp apps/api/.env.example apps/api/.env   # укажите строку подключения к БД
npm run prisma:migrate --workspace apps/api -- --name init
npx prisma db seed --prefix apps/api     # демо-роли и владелец owner@demo.kern
npm run dev:api     # backend на http://localhost:3000
npm run dev:web     # веб-панель на http://localhost:5173
```

Демо-вход: `owner@demo.kern` / `change-me-now` — сменить перед реальным
использованием.

## Статус

Этап 00 — каркас репозитория и ролевая модель, проверен живым запуском
(вход → дашборд → список участков через реальный API и PostgreSQL).
Реализация — учебный скелет, отражающий доменную модель и RBAC из плана;
бизнес-логика расчёта зарплаты уточняется агентом `payroll-rules` перед
тем как `backend-dev` доводит её до готовности к Этапу 03.
