#!/usr/bin/env node
/**
 * tools/ops/backup.js
 *
 * Резервное копирование БД платформы КЕРН из контейнера postgres,
 * поднятого docker-compose.yml в корне репозитория.
 *
 * Что делает:
 *   1. Читает POSTGRES_USER/PASSWORD/DB из .env в корне репозитория
 *      (тот же файл использует docker-compose.yml).
 *   2. Запускает `docker compose exec postgres pg_dump ...` в формате
 *      custom (-F c) — это официальный бинарный формат pg_dump,
 *      восстанавливается через pg_restore (см. tools/ops/restore.js) и
 *      компактнее обычного SQL-дампа.
 *   3. Сохраняет результат в backups/kern-<таймстамп>.dump.
 *   4. Ротация: оставляет только последние KERN_BACKUP_KEEP (по
 *      умолчанию 14) файлов в backups/, более старые удаляет.
 *
 * Кроссплатформенный (Node, а не bash/PowerShell) — работает и на
 * Windows-хосте компании, и на будущем Linux VPS без двух отдельных
 * реализаций логики; tools/ops/backup.ps1 и tools/ops/backup.sh — это
 * тонкие обёртки для планировщиков (Task Scheduler / cron), которые
 * просто вызывают этот файл.
 *
 * Запуск:
 *   node tools/ops/backup.js
 *
 * Переменные окружения (необязательные, есть значения по умолчанию):
 *   KERN_BACKUP_DIR   — куда складывать дампы (по умолчанию backups/ в корне репо)
 *   KERN_BACKUP_KEEP  — сколько последних дампов хранить (по умолчанию 14)
 *
 * ВАЖНО: «бэкап, который никто не пробовал развернуть, — не бэкап».
 * Этот скрипт только создаёт дамп. Периодически (не реже раза перед
 * стартом пилота и потом хотя бы раз в пару недель) проверяйте
 * восстановление реальным прогоном tools/ops/restore.js на тестовой
 * копии — см. docs/ops-runbook.md, раздел «Проверка бэкапов».
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readEnvFile } = require('./env-file');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function rotate(backupDir, keep) {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('kern-') && f.endsWith('.dump'))
    .sort(); // имена содержат timestamp в сортируемом формате

  const excess = files.length - keep;
  if (excess <= 0) return [];

  const toDelete = files.slice(0, excess);
  for (const f of toDelete) {
    fs.unlinkSync(path.join(backupDir, f));
  }
  return toDelete;
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(
      `[backup] Не найден ${ENV_PATH}. Скопируйте .env.example в .env и заполните значения (см. docs/ops-runbook.md).`,
    );
    process.exit(1);
  }

  const env = readEnvFile(ENV_PATH);
  const user = env.POSTGRES_USER || 'kern';
  const db = env.POSTGRES_DB || 'kern';
  const password = env.POSTGRES_PASSWORD;

  if (!password) {
    console.error('[backup] POSTGRES_PASSWORD не задан в .env — нечем авторизоваться в БД.');
    process.exit(1);
  }

  const backupDir = process.env.KERN_BACKUP_DIR
    ? path.resolve(process.env.KERN_BACKUP_DIR)
    : path.join(REPO_ROOT, 'backups');
  const keep = Number(process.env.KERN_BACKUP_KEEP || 14);

  fs.mkdirSync(backupDir, { recursive: true });

  const fileName = `kern-${timestamp()}.dump`;
  const filePath = path.join(backupDir, fileName);
  const tmpPath = `${filePath}.part`;

  console.log(`[backup] Снимаю дамп БД "${db}" в ${filePath} ...`);

  const args = [
    'compose',
    'exec',
    '-T',
    '-e',
    `PGPASSWORD=${password}`,
    'postgres',
    'pg_dump',
    '-U',
    user,
    '-d',
    db,
    '-F',
    'c',
  ];

  const child = spawn('docker', args, { cwd: REPO_ROOT });
  const out = fs.createWriteStream(tmpPath);
  child.stdout.pipe(out);

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (err) => {
    console.error('[backup] Не удалось запустить `docker`. Установлен ли Docker и есть ли он в PATH?');
    console.error(err.message);
    cleanupTmp();
    process.exit(1);
  });

  child.on('close', (code) => {
    out.close();
    if (code !== 0) {
      console.error(`[backup] pg_dump завершился с ошибкой (код ${code}).`);
      if (stderr) console.error(stderr.trim());
      console.error('[backup] Убедитесь, что контейнер postgres запущен: docker compose ps');
      cleanupTmp();
      process.exit(1);
    }

    const stat = fs.statSync(tmpPath);
    if (stat.size === 0) {
      console.error('[backup] Дамп получился пустым (0 байт) — что-то пошло не так, файл НЕ сохраняю как валидный бэкап.');
      cleanupTmp();
      process.exit(1);
    }

    fs.renameSync(tmpPath, filePath);
    console.log(`[backup] Готово: ${filePath} (${(stat.size / 1024).toFixed(1)} КБ)`);

    const deleted = rotate(backupDir, keep);
    if (deleted.length > 0) {
      console.log(`[backup] Ротация: удалено старых дампов — ${deleted.length} (${deleted.join(', ')})`);
    }
  });

  function cleanupTmp() {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // не критично — недописанный .part-файл просто останется на диске
      }
    }
  }
}

main();
