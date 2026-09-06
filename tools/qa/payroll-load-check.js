/**
 * tools/qa/payroll-load-check.js
 *
 * Лёгкая проверка конкурентности (НЕ полноценный нагрузочный тест) —
 * Этап 05, докс/project-plan.md раздел 9. Бьёт по запущенному backend
 * параллельными запросами (10-20 одновременно, локальная машина) на:
 *   A. Создание табеля (POST /timesheets) — много одновременных вставок
 *      на разные даты одного сотрудника.
 *   B. Запуск расчёта зарплаты (POST /payroll/runs) на один и тот же
 *      пересекающийся период — несколько раз подряд/параллельно.
 *
 * Смотрит на:
 *   - сервер не падает (нет разрывов соединения / необработанных 500);
 *   - каждый созданный PayrollRun внутренне согласован (netAmount не
 *     "рассыпается" из-за гонки при параллельном чтении/записи в одной
 *     и той же транзакции для разных запусков);
 *   - время ответа не деградирует катастрофически по мере роста
 *     параллелизма.
 *
 * Важно: PayrollService.runPayroll не идемпотентен по дизайну (нет
 * уникального ограничения на (companyId, periodStart, periodEnd) и нет
 * идемпотентного ключа запроса) — при N параллельных вызовах ожидаемо
 * получить N отдельных PayrollRun. Это NOT считается багом гонки самим
 * по себе (см. отчёт qa-tester) — баг был бы, если бы суммы внутри
 * runs оказались некорректными/непостоянными.
 *
 * Настройка тестовых фикстур — напрямую через Prisma (не через API),
 * т.к. это не тест ролевой модели или доменной логики, а нагрузочная
 * проба; все фикстуры помечены префиксом QA-LOAD- и удаляются в finally.
 *
 * Запуск: node tools/qa/payroll-load-check.js
 */

const { PrismaClient, Prisma } = require('@prisma/client');

const BASE_URL = process.env.KERN_API_URL || 'http://localhost:3000';
const CONCURRENCY = Number(process.env.QA_LOAD_CONCURRENCY || 15);

const prisma = new PrismaClient();

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (res.status !== 200) throw new Error(`Login failed: ${JSON.stringify(json)}`);
  return json.accessToken;
}

async function apiTimed(token, method, path, body) {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ms = Date.now() - start;
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, ms };
}

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = arr.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / arr.length),
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1],
  };
}

const cleanup = { payrollRunIds: [], timesheetIds: [], employeeId: null, crewId: null, siteId: null };

async function runCleanup() {
  console.log('\n--- Очистка тестовых данных (payroll-load-check) ---');
  try {
    if (cleanup.payrollRunIds.length) {
      await prisma.payrollLine.deleteMany({ where: { payrollRunId: { in: cleanup.payrollRunIds } } });
      await prisma.payrollRun.deleteMany({ where: { id: { in: cleanup.payrollRunIds } } });
    }
    if (cleanup.timesheetIds.length) {
      await prisma.timesheet.deleteMany({ where: { id: { in: cleanup.timesheetIds } } });
    }
    if (cleanup.employeeId) await prisma.employee.deleteMany({ where: { id: cleanup.employeeId } });
    if (cleanup.crewId) await prisma.crew.deleteMany({ where: { id: cleanup.crewId } });
    if (cleanup.siteId) await prisma.site.deleteMany({ where: { id: cleanup.siteId } });
    console.log('Очистка завершена.');
  } catch (e) {
    console.error('ОШИБКА при очистке — проверьте вручную:', e);
  }
}

async function main() {
  console.log(`Payroll/timesheet concurrency check против ${BASE_URL}, CONCURRENCY=${CONCURRENCY}\n`);

  const ownerToken = await login('owner@demo.kern', 'change-me-now');

  const company = await prisma.company.findFirstOrThrow();
  const position = await prisma.position.findFirstOrThrow({ where: { companyId: company.id } });

  const site = await prisma.site.create({
    data: { companyId: company.id, name: 'QA-LOAD-Участок', code: `QA-LOAD-${Date.now()}`, workType: 'drilling' },
  });
  cleanup.siteId = site.id;
  const crew = await prisma.crew.create({ data: { siteId: site.id, name: 'QA-LOAD-Бригада' } });
  cleanup.crewId = crew.id;
  const employee = await prisma.employee.create({
    data: { companyId: company.id, positionId: position.id, crewId: crew.id, fullName: 'QA-LOAD Сотрудник' },
  });
  cleanup.employeeId = employee.id;

  // ===================================================================
  // A. Параллельное создание табелей — 8ч на каждый из CONCURRENCY дней
  //    подряд одного сотрудника. Это не проверка гонки на уникальность
  //    (схема не запрещает несколько табелей на одну дату), а проверка,
  //    что сервер выдерживает параллельные записи без падений/деградации.
  // ===================================================================
  console.log(`[A] ${CONCURRENCY} параллельных POST /timesheets`);
  const periodStart = new Date('2026-02-01T00:00:00Z');
  const timesheetPromises = Array.from({ length: CONCURRENCY }, (_, i) => {
    const workDate = new Date(periodStart.getTime() + i * 24 * 3600 * 1000);
    return apiTimed(ownerToken, 'POST', '/timesheets', {
      employeeId: employee.id,
      siteId: site.id,
      crewId: crew.id,
      workDate: workDate.toISOString(),
      workType: 'drilling',
      regularHours: 8,
    });
  });
  const timesheetResults = await Promise.all(timesheetPromises);
  const tsOk = timesheetResults.filter((r) => r.status === 201);
  const tsFail = timesheetResults.filter((r) => r.status !== 201);
  tsOk.forEach((r) => cleanup.timesheetIds.push(r.json.id));

  console.log(`  Успешно создано: ${tsOk.length}/${CONCURRENCY}`);
  if (tsFail.length) {
    console.log(`  ОШИБКИ (${tsFail.length}):`, tsFail.map((r) => r.status));
  }
  console.log(`  Время ответа (мс): ${JSON.stringify(stats(timesheetResults.map((r) => r.ms)))}`);

  // Переводим все созданные табели в locked напрямую через Prisma —
  // цель раздела Б не в проверке цепочки согласования (это отдельный
  // тест), а в конкурентности расчёта зарплаты по уже готовым данным.
  await prisma.timesheet.updateMany({ where: { id: { in: tsOk.map((r) => r.json.id) } }, data: { status: 'locked' } });

  // ===================================================================
  // B. Параллельный запуск расчёта зарплаты на один и тот же период.
  // ===================================================================
  console.log(`\n[B] ${CONCURRENCY} параллельных POST /payroll/runs (один и тот же пересекающийся период)`);
  const runBody = { periodStart: '2026-02-01', periodEnd: '2026-02-28' };
  const runPromises = Array.from({ length: CONCURRENCY }, () => apiTimed(ownerToken, 'POST', '/payroll/runs', runBody));
  const runResults = await Promise.all(runPromises);
  const runOk = runResults.filter((r) => r.status === 201 || r.status === 200);
  const runFail = runResults.filter((r) => !(r.status === 201 || r.status === 200));
  runOk.forEach((r) => cleanup.payrollRunIds.push(r.json.id));

  console.log(`  Успешно создано PayrollRun: ${runOk.length}/${CONCURRENCY}`);
  if (runFail.length) {
    console.log(`  ОШИБКИ/отказы (${runFail.length}):`);
    for (const r of runFail) console.log(`    status=${r.status} body=${JSON.stringify(r.json)}`);
  }
  console.log(`  Время ответа (мс): ${JSON.stringify(stats(runResults.map((r) => r.ms)))}`);

  // Сверка согласованности сумм: для одного и того же сотрудника и
  // одного и того же набора locked-табелей все runOk запуски должны
  // дать ОДИНАКОВЫЙ netAmount по строке этого сотрудника — если суммы
  // расходятся между запусками, это явный признак гонки в расчёте
  // (например, частичного чтения ещё не закоммиченных данных).
  const netAmounts = runOk
    .map((r) => r.json.lines?.find((l) => l.employeeId === employee.id)?.netAmount)
    .filter((v) => v !== undefined);
  const uniqueNetAmounts = [...new Set(netAmounts.map(String))];
  console.log(`\n  netAmount по сотруднику во всех успешных запусках: ${JSON.stringify(uniqueNetAmounts)}`);
  console.log(
    uniqueNetAmounts.length === 1
      ? '  OK: суммы идентичны во всех параллельных запусках — расчёт не подвержен гонке по чтению данных.'
      : '  FAIL: суммы РАЗЛИЧАЮТСЯ между параллельными запусками одного и того же периода — похоже на гонку.',
  );

  console.log(
    `\n  Примечание: ${runOk.length} отдельных PayrollRun для одного периода создано по дизайну ` +
      '(runPayroll не идемпотентен, нет уникального ограничения/lock на период) — ' +
      'это не баг гонки, а ожидаемое поведение текущей реализации; см. отчёт qa-tester для рекомендации архитектору.',
  );

  console.log('\n=== Конец проверки конкурентности ===');
}

main()
  .catch((e) => console.error('Проверка упала с ошибкой:', e))
  .finally(async () => {
    await runCleanup();
    await prisma.$disconnect();
  });
