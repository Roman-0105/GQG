#!/usr/bin/env node
/**
 * tools/ci/check.js
 *
 * Воспроизводимая проверка перед мерджем — то, что раньше делалось (или
 * не делалось) ручным чек-листом: чистая установка зависимостей, сборка
 * обоих workspace'ов, юнит-тесты backend'а (пишет их qa-tester, этот
 * скрипт их только запускает) и линт, если он настроен.
 *
 * Намеренно НЕ настраивает сам ESLint и не придумывает правила линта —
 * выбор конкретных правил и стиля кода не входит в зону devops
 * (см. .claude/agents/devops.md). Если в package.json какого-то
 * workspace появится скрипт "lint" — этот раннер начнёт его
 * подхватывать сам, без правок здесь.
 *
 * Запуск (локально или из будущего CI):
 *   node tools/ci/check.js
 *
 * Код выхода 0 — всё прошло, не 0 — что-то упало (см. вывод выше).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKSPACES = ['apps/api', 'apps/web'];

function run(label, command, args, options = {}) {
  console.log(`\n>>> ${label}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) {
    console.error(`\n[ci] Шаг "${label}" завершился с ошибкой (код ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

function hasScript(workspaceRelPath, scriptName) {
  const pkgPath = path.join(REPO_ROOT, workspaceRelPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return Boolean(pkg.scripts && pkg.scripts[scriptName]);
}

function main() {
  run('Установка зависимостей (npm ci)', 'npm', ['ci']);
  run('Сборка (api + web)', 'npm', ['run', 'build']);
  run('Юнит-тесты backend', 'npm', ['test', '--workspace', 'apps/api']);

  for (const ws of WORKSPACES) {
    if (hasScript(ws, 'lint')) {
      run(`Линт (${ws})`, 'npm', ['run', 'lint', '--workspace', ws]);
    } else {
      console.log(
        `\n[ci] Пропускаю линт для ${ws} — в package.json нет скрипта "lint". ` +
          'Это не сбой, но и не проверка: ESLint для этого репозитория пока не настроен ' +
          '(находка devops для backend-dev/frontend-dev, см. отчёт).',
      );
    }
  }

  console.log('\n[ci] Все шаги пройдены.');
}

main();
