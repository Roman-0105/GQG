#!/bin/sh
# Точка входа контейнера backend'а КЕРН.
#
# Порядок важен: миграции применяются ДО старта сервера, и именно
# `prisma migrate deploy` (только проигрывает уже существующие
# миграции из apps/api/prisma/migrations в порядке их создания), а не
# `prisma migrate dev` или `db push` — последние могут переписать схему
# по diff'у и в проде способны молча уронить данные, если кто-то не
# закоммитил миграцию за собой. `migrate deploy` ничего не придумывает
# сам и упадёт с понятной ошибкой, если история миграций разошлась.
set -e

echo "[kern-api] Применяю миграции БД (prisma migrate deploy)..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[kern-api] Миграции применены. Запускаю сервер..."
exec node dist/main.js
