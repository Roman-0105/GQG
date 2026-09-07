# Образ backend'а КЕРН (NestJS + Prisma).
#
# Собирается из корня монорепозитория (context: .), а не из apps/api —
# это workspace-проект (npm workspaces, см. корневой package.json), и
# package-lock.json на уровне репозитория описывает зависимости сразу
# для apps/api и apps/web. `npm ci` без полного набора package.json всех
# воркспейсов откажется работать («invalid: lock file does not match
# package.json»), поэтому в контекст билда обязательно попадает и
# apps/web/package.json, даже если сам web в этом образе не собирается.
#
# Стадии сознательно не урезают devDependencies после сборки: чтобы
# аккуратно вырезать dev-зависимости в npm workspaces, нужно заново
# генерировать Prisma Client в отдельной "prod" стадии (сам `prisma` —
# devDependency), что усложняет Dockerfile и его труднее проверить
# глазами без реального docker build под рукой (см. отчёт devops).
# Итоговый образ немного крупнее, чем мог бы быть, но корректен.
# Возможная оптимизация размера — отдельная задача на будущее, когда
# появится возможность проверить сборку живым `docker build`.

FROM node:20-alpine AS deps
WORKDIR /app
# Prisma-движки на Alpine (musl) требуют openssl — без него на старте
# падает с "Unable to require libquery_engine...".
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM deps AS build
COPY apps/api/tsconfig.json apps/api/nest-cli.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/src apps/api/src
# `prisma generate` выполняется прямо в этом (alpine) окружении, поэтому
# бинарник query-engine собирается сразу под linux-musl без явного
# указания binaryTargets в schema.prisma — совпадает с рантайм-стадией
# ниже (тот же базовый образ node:20-alpine).
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npm run build --workspace apps/api

FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
RUN chmod +x apps/api/docker-entrypoint.sh

WORKDIR /app/apps/api
EXPOSE 3000

# Перед стартом применяет накопленные миграции (`prisma migrate deploy`,
# НЕ `db push` — важно сохранить историю миграций для прод-данных
# пилота) и только потом поднимает сервер.
ENTRYPOINT ["./docker-entrypoint.sh"]
