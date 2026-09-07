#!/usr/bin/env node
/**
 * tools/ops/restore.js
 *
 * Восстановление БД платформы КЕРН из дампа, снятого tools/ops/backup.js
 * (формат pg_dump -F c, восстанавливается через pg_restore).
 *
 * ЭТО РАЗРУШИТЕЛЬНАЯ ОПЕРАЦИЯ: pg_restore запускается с --clean —
 * существующие таблицы в целевой БД будут удалены и пересозданы из
 * дампа. Всё, что было записано после снятия дампа, будет потеряно.
 *
 * Защиты, встроенные в скрипт:
 *   1. Требует явный флаг --yes — без него только печатает план действий
 *      и ничего не делает.
 *   2. Проверяет, что контейнер api ОСТАНОВЛЕН, и отказывается
 *      продолжать, если он ещё работает (иначе API продолжит писать в
 *      БД поверх процесса восстановления) — если вы уверены, что это
 *      нужно, остановите api сами: `docker compose stop api`.
 *
 * Запуск:
 *   docker compose stop api
 *   node tools/ops/restore.js backups/kern-20260906T030000.dump --yes
 */
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readEnvFile } = require('./env-file');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(REPO_ROOT, '.env');

function printUsageAndExit(code) {
  console.log(`
Использование:
  node tools/ops/restore.js <путь-к-дампу> --yes

Перед запуском ОБЯЗАТЕЛЬНО остановите backend, чтобы он не писал в БД
во время восстановления:
  docker compose stop api

Пример:
  node tools/ops/restore.js backups/kern-20260906T030000.dump --yes
`);
  process.exit(code);
}

function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--yes');
  const dumpArg = args.find((a) => !a.startsWith('--'));

  if (!dumpArg) printUsageAndExit(1);

  const dumpPath = path.resolve(dumpArg);
  if (!fs.existsSync(dumpPath)) {
    console.error(`[restore] Файл дампа не найден: ${dumpPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(ENV_PATH)) {
    console.error(`[restore] Не найден ${ENV_PATH}. Скопируйте .env.example в .env и заполните значения.`);
    process.exit(1);
  }

  const env = readEnvFile(ENV_PATH);
  const user = env.POSTGRES_USER || 'kern';
  const db = env.POSTGRES_DB || 'kern';
  const password = env.POSTGRES_PASSWORD;

  if (!password) {
    console.error('[restore] POSTGRES_PASSWORD не задан в .env.');
    process.exit(1);
  }

  console.log(`
ВНИМАНИЕ: сейчас будет ПОЛНОСТЬЮ ПЕРЕЗАПИСАНА база данных "${db}"
содержимым дампа:
  ${dumpPath}

Всё, что было записано в БД после снятия этого дампа, будет потеряно
безвозвратно (табели, расчёты ЗП и т.д.).
`);

  // Защита: не восстанавливаем поверх работающего API — он продолжит
  // писать в БД параллельно с pg_restore и либо получит непонятные
  // ошибки, либо испортит только что восстановленные данные.
  const psRunning = spawnSync('docker', ['compose', 'ps', '-q', 'api'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const apiContainerId = (psRunning.stdout || '').trim();
  if (apiContainerId) {
    const inspect = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', apiContainerId], {
      encoding: 'utf8',
    });
    if ((inspect.stdout || '').trim() === 'true') {
      console.error(
        '[restore] Контейнер api сейчас запущен. Остановите его перед восстановлением:\n' +
          '  docker compose stop api\n' +
          'и запустите restore.js заново.',
      );
      process.exit(1);
    }
  }

  if (!confirmed) {
    console.log('[restore] Это была проверка (dry-run) — ничего не изменено.');
    console.log('[restore] Чтобы реально восстановить БД, добавьте флаг --yes.');
    printUsageAndExit(0);
  }

  console.log('[restore] Подтверждено флагом --yes. Восстанавливаю...');

  const args2 = [
    'compose',
    'exec',
    '-T',
    '-e',
    `PGPASSWORD=${password}`,
    'postgres',
    'pg_restore',
    '-U',
    user,
    '-d',
    db,
    '--clean',
    '--if-exists',
    '--no-owner',
  ];

  const child = spawn('docker', args2, { cwd: REPO_ROOT, stdio: ['pipe', 'inherit', 'inherit'] });
  fs.createReadStream(dumpPath).pipe(child.stdin);

  child.on('error', (err) => {
    console.error('[restore] Не удалось запустить `docker`.', err.message);
    process.exit(1);
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`[restore] pg_restore завершился с ошибкой (код ${code}). Проверьте вывод выше.`);
      process.exit(1);
    }
    console.log('[restore] Восстановление завершено. Запустите backend обратно:');
    console.log('  docker compose start api');
    console.log('Проверьте, что данные на месте, прежде чем продолжать работу с системой.');
  });
}

main();
