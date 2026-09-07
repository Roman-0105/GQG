#!/bin/sh
# tools/ops/backup.sh
#
# Тонкая обёртка над tools/ops/backup.js для запуска из cron на
# Linux-сервере/VPS (если в будущем платформа переедет туда — см.
# docs/project-plan.md, раздел 10, открытый вопрос про хостинг). Вся
# логика — в backup.js, здесь только находим корень репозитория.
#
# Ручной запуск:
#   sh tools/ops/backup.sh
#
# Пример строки cron (ежедневно в 03:00):
#   0 3 * * * /usr/bin/env sh /path/to/kern/tools/ops/backup.sh >> /var/log/kern-backup.log 2>&1
set -e
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

cd "$REPO_ROOT"
exec node tools/ops/backup.js
