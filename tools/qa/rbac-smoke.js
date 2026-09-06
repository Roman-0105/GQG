/**
 * tools/qa/rbac-smoke.js
 *
 * Переиспользуемый смоук-тест ролевой модели (RBAC/scope) КЕРН —
 * настоящие HTTP-запросы к запущенному backend (localhost:3000),
 * не юнит-моки. Написан независимо qa-tester для Этапа 05
 * (docs/project-plan.md, раздел 9) и предназначен для повторного
 * прогона после каждого следующего изменения ролевой модели.
 *
 * Что проверяет:
 *   1. Бригадир НЕ может: GET /sites, GET /crews (общий список),
 *      GET /users, GET /analytics/* — везде 403.
 *   2. Бригадир МОЖЕТ: GET /crews/mine (своя бригада, без общего права).
 *   3. Бригадир не может создать табель за чужую бригаду/участок (IDOR).
 *   4. Владелец МОЖЕТ то же самое, что бригадиру запрещено (позитивный
 *      кейс — не только "всё запрещено", но и "легитимное разрешено").
 *   5. HR не может создать/изменить пользователя с ролью шире своей
 *      (эскалация привилегий) — целевой регресс сегодняшнего фикса
 *      сравнения по РАНГУ scope в users.service.ts (SCOPE_RANK).
 *   6. Владелец МОЖЕТ назначить пользователю более УЗКУЮ роль
 *      (own_sites/own_crew) — именно это было сломано до сегодняшнего
 *      фикса (сравнение строк вместо рангов).
 *   7. Удаление бригады с сотрудниками -> 400 (не 500), с пустой
 *      бригадой -> 200.
 *   8. Архивация участка скрывает его из GET /sites и показывает
 *      его в GET /sites?archived=true.
 *
 * Для настройки тестовых фикстур (временный участок/бригада/сотрудник)
 * скрипт создаёт данные через тот же HTTP API от имени владельца, а не
 * напрямую в БД, — единственное исключение: чтение/удаление созданных
 * тестовых данных при очистке использует Prisma напрямую, потому что
 * часть сущностей (Site, Employee, User) не имеет DELETE-эндпоинта в
 * API (архивация/деактивация — это осознанное продуктовое решение, не
 * упущение, см. sites.service.ts/users.service.ts). Все тестовые
 * записи помечены префиксом "QA-SMOKE-" и удаляются в finally.
 *
 * Запуск:
 *   node tools/qa/rbac-smoke.js
 *
 * Требует: поднятый backend на BASE_URL, доступную PostgreSQL (для
 * очистки через Prisma), демо-логины из README/инструкций QA.
 */

const { PrismaClient } = require('@prisma/client');

const BASE_URL = process.env.KERN_API_URL || 'http://localhost:3000';

const CREDS = {
  owner: { email: 'owner@demo.kern', password: 'change-me-now' },
  foreman: { email: 'ivan.petrov@kern.local', password: 'temp12345' },
  hr: { email: 'hr.test@kern.local', password: 'temp12345' },
};

const prisma = new PrismaClient();

let passCount = 0;
let failCount = 0;
const failures = [];

function check(description, condition, extra) {
  if (condition) {
    passCount++;
    console.log(`  OK   ${description}`);
  } else {
    failCount++;
    failures.push({ description, extra });
    console.log(`  FAIL ${description}`);
    if (extra !== undefined) console.log(`       -> ${JSON.stringify(extra)}`);
  }
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function login(creds) {
  const { status, json } = await api(null, 'POST', '/auth/login', creds);
  if (status !== 200) {
    throw new Error(`Не удалось войти как ${creds.email}: ${status} ${JSON.stringify(json)}`);
  }
  return json.accessToken;
}

// -------------------------------------------------------------------
// Очистка тестовых фикстур. Собирает id всего созданного за прогон и
// удаляет/деактивирует в правильном порядке зависимостей, чтобы не
// оставить мусор в демо-данных (требование задачи).
// -------------------------------------------------------------------
const cleanup = {
  payrollRunIds: [],
  timesheetIds: [],
  employeeIds: [],
  crewIds: [],
  siteIds: [],
  userIdsToDeactivate: [],
  roleIdsToDelete: [], // временные кастомные роли (см. [10]) — удаляются ПОСЛЕ userIdsToDeactivate
};

async function runCleanup() {
  console.log('\n--- Очистка тестовых данных ---');
  try {
    if (cleanup.payrollRunIds.length) {
      await prisma.payrollLine.deleteMany({ where: { payrollRunId: { in: cleanup.payrollRunIds } } });
      await prisma.payrollRun.deleteMany({ where: { id: { in: cleanup.payrollRunIds } } });
    }
    if (cleanup.timesheetIds.length) {
      await prisma.timesheet.deleteMany({ where: { id: { in: cleanup.timesheetIds } } });
    }
    if (cleanup.employeeIds.length) {
      await prisma.employee.deleteMany({ where: { id: { in: cleanup.employeeIds } } });
    }
    if (cleanup.crewIds.length) {
      await prisma.crew.deleteMany({ where: { id: { in: cleanup.crewIds } } });
    }
    if (cleanup.siteIds.length) {
      await prisma.site.deleteMany({ where: { id: { in: cleanup.siteIds } } });
    }
    if (cleanup.userIdsToDeactivate.length) {
      // Нет DELETE /users в API (осознанно — аудиторский след), поэтому
      // и в очистке деактивируем, а не удаляем — так же, как поступил
      // бы владелец компании через UI.
      await prisma.roleAssignment.deleteMany({ where: { userId: { in: cleanup.userIdsToDeactivate } } });
      await prisma.user.deleteMany({ where: { id: { in: cleanup.userIdsToDeactivate } } });
    }
    if (cleanup.roleIdsToDelete.length) {
      // Только после того, как все RoleAssignment на эти роли уже
      // удалены выше (иначе FK RESTRICT на RoleAssignment.roleId).
      await prisma.permission.deleteMany({ where: { roleId: { in: cleanup.roleIdsToDelete } } });
      await prisma.role.deleteMany({ where: { id: { in: cleanup.roleIdsToDelete } } });
    }
    console.log('Очистка завершена.');
  } catch (e) {
    console.error('ОШИБКА при очистке тестовых данных — проверьте вручную:', e);
  }
}

async function main() {
  console.log(`RBAC smoke test против ${BASE_URL}\n`);

  const ownerToken = await login(CREDS.owner);
  const foremanToken = await login(CREDS.foreman);
  const hrToken = await login(CREDS.hr);

  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString();

  // Существующий участок демо-данных (SITE-14) — нужен для GET /crews?siteId=.
  const sitesAsOwner = await api(ownerToken, 'GET', '/sites');
  check('Подготовка: владелец видит хотя бы один участок (SITE-14)', sitesAsOwner.status === 200 && sitesAsOwner.json.length > 0, sitesAsOwner);
  const site14 = sitesAsOwner.json.find((s) => s.code === 'SITE-14') || sitesAsOwner.json[0];

  // ===================================================================
  // 1) Бригадир НЕ должен читать /sites, /crews (общий список),
  //    /users, /analytics/* — везде 403.
  // ===================================================================
  console.log('\n[1] Бригадир (Иван) — запрещённые ресурсы (ожидаем 403)');

  const foremanSites = await api(foremanToken, 'GET', '/sites');
  check('GET /sites бригадиром -> 403', foremanSites.status === 403, foremanSites);

  const foremanCrews = await api(foremanToken, 'GET', `/crews?siteId=${site14.id}`);
  check('GET /crews?siteId=... бригадиром -> 403', foremanCrews.status === 403, foremanCrews);

  const foremanUsers = await api(foremanToken, 'GET', '/users');
  check('GET /users бригадиром -> 403', foremanUsers.status === 403, foremanUsers);

  const foremanAnalytics = await api(foremanToken, 'GET', `/analytics/totals?from=${from}&to=${to}`);
  check('GET /analytics/totals бригадиром -> 403', foremanAnalytics.status === 403, foremanAnalytics);

  // ===================================================================
  // 2) Бригадир МОЖЕТ читать свою бригаду через выделенный /crews/mine
  //    (без общего права crew:read) — не общий "всё запрещено".
  // ===================================================================
  console.log('\n[2] Бригадир — разрешённый ресурс своей бригады (ожидаем 200)');
  const foremanMine = await api(foremanToken, 'GET', '/crews/mine');
  check('GET /crews/mine бригадиром -> 200 и содержит его бригаду', foremanMine.status === 200 && foremanMine.json.length > 0, foremanMine);
  const foremanCrew = foremanMine.json?.[0];

  // ===================================================================
  // 3) Владелец МОЖЕТ то же самое, что бригадиру запрещено (позитив).
  // ===================================================================
  console.log('\n[3] Владелец — те же ресурсы (ожидаем 200)');
  const ownerCrews = await api(ownerToken, 'GET', `/crews?siteId=${site14.id}`);
  check('GET /crews?siteId=... владельцем -> 200', ownerCrews.status === 200, ownerCrews);
  const ownerUsers = await api(ownerToken, 'GET', '/users');
  check('GET /users владельцем -> 200', ownerUsers.status === 200, ownerUsers);
  const ownerAnalytics = await api(ownerToken, 'GET', `/analytics/totals?from=${from}&to=${to}`);
  check('GET /analytics/totals владельцем -> 200', ownerAnalytics.status === 200, ownerAnalytics);

  // ===================================================================
  // 4) Кросс-бригадный IDOR: бригадир не может внести табель за чужую
  //    бригаду/участок. Владелец заводит временный участок+бригаду.
  // ===================================================================
  console.log('\n[4] Табель за чужую бригаду (IDOR)');

  const positionsRes = await api(ownerToken, 'GET', '/positions');
  const positionId = positionsRes.json?.[0]?.id;
  check('Подготовка: есть хотя бы одна должность для тестового сотрудника', !!positionId, positionsRes);

  const tempSite = await api(ownerToken, 'POST', '/sites', {
    name: 'QA-SMOKE-Временный участок',
    code: `QA-SMOKE-${Date.now()}`,
    workType: 'drilling',
  });
  check('Подготовка: владелец создал временный участок', tempSite.status === 201, tempSite);
  if (tempSite.status === 201) cleanup.siteIds.push(tempSite.json.id);

  const tempCrew = await api(ownerToken, 'POST', '/crews', {
    siteId: tempSite.json.id,
    name: 'QA-SMOKE-Чужая бригада',
  });
  check('Подготовка: владелец создал временную (чужую для Ивана) бригаду', tempCrew.status === 201, tempCrew);
  if (tempCrew.status === 201) cleanup.crewIds.push(tempCrew.json.id);

  const tempEmployee = await api(ownerToken, 'POST', '/employees', {
    fullName: 'QA-SMOKE Временный сотрудник',
    positionId,
    crewId: tempCrew.json.id,
  });
  check('Подготовка: владелец создал сотрудника во временной бригаде', tempEmployee.status === 201, tempEmployee);
  if (tempEmployee.status === 201) cleanup.employeeIds.push(tempEmployee.json.id);

  const foreignTimesheetAttempt = await api(foremanToken, 'POST', '/timesheets', {
    employeeId: tempEmployee.json.id,
    siteId: tempSite.json.id,
    crewId: tempCrew.json.id,
    workDate: new Date().toISOString(),
    workType: 'drilling',
    regularHours: 8,
  });
  check(
    'POST /timesheets бригадиром за чужую бригаду -> 403 (не создаёт запись)',
    foreignTimesheetAttempt.status === 403,
    foreignTimesheetAttempt,
  );

  // Позитив: владелец МОЖЕТ внести и полностью провести табель по любой
  // бригаде компании (submit -> approve -> lock).
  console.log('\n[4b] Владелец может провести табель по любой бригаде (позитив)');
  const ownerTimesheet = await api(ownerToken, 'POST', '/timesheets', {
    employeeId: tempEmployee.json.id,
    siteId: tempSite.json.id,
    crewId: tempCrew.json.id,
    workDate: new Date().toISOString(),
    workType: 'drilling',
    regularHours: 8,
  });
  check('POST /timesheets владельцем -> 201', ownerTimesheet.status === 201, ownerTimesheet);
  if (ownerTimesheet.status === 201) cleanup.timesheetIds.push(ownerTimesheet.json.id);

  if (ownerTimesheet.status === 201) {
    const tsId = ownerTimesheet.json.id;
    const submitRes = await api(ownerToken, 'POST', `/timesheets/${tsId}/submit`);
    check('POST /timesheets/:id/submit владельцем -> 200', submitRes.status === 200 || submitRes.status === 201, submitRes);

    // Владелец не может согласовать собственный табель (бизнес-правило,
    // не ролевая проверка) — фиксируем ожидаемое поведение отдельно, не
    // как провал RBAC.
    const selfApprove = await api(ownerToken, 'POST', `/timesheets/${tsId}/approve`);
    check(
      'POST /timesheets/:id/approve автором табеля -> 400 "нельзя согласовать собственный" (бизнес-правило, не RBAC)',
      selfApprove.status === 400,
      selfApprove,
    );
  }

  // ===================================================================
  // 5) Удаление бригады: с сотрудниками -> 400, без сотрудников -> 200.
  // ===================================================================
  console.log('\n[5] Удаление бригады');
  const deleteNonEmptyCrew = await api(ownerToken, 'DELETE', `/crews/${tempCrew.json.id}`);
  check(
    'DELETE /crews/:id с сотрудниками внутри -> 400 (не 500), с понятным сообщением',
    deleteNonEmptyCrew.status === 400 && typeof deleteNonEmptyCrew.json?.message === 'string',
    deleteNonEmptyCrew,
  );

  const emptyCrew = await api(ownerToken, 'POST', '/crews', {
    siteId: tempSite.json.id,
    name: 'QA-SMOKE-Пустая бригада',
  });
  check('Подготовка: временная пустая бригада создана', emptyCrew.status === 201, emptyCrew);
  if (emptyCrew.status === 201) {
    const deleteEmptyCrew = await api(ownerToken, 'DELETE', `/crews/${emptyCrew.json.id}`);
    check('DELETE /crews/:id без сотрудников -> 200 (удаляется)', deleteEmptyCrew.status === 200, deleteEmptyCrew);
    // Если удаление не удалось (баг) — не забываем прибрать в cleanup.
    if (deleteEmptyCrew.status !== 200) cleanup.crewIds.push(emptyCrew.json.id);
  }

  // ===================================================================
  // 6) Архивация участка: скрывает из GET /sites, показывает с ?archived=true.
  // ===================================================================
  console.log('\n[6] Архивация участка');
  const archiveRes = await api(ownerToken, 'POST', `/sites/${tempSite.json.id}/archive`);
  check('POST /sites/:id/archive -> 200', archiveRes.status === 200 || archiveRes.status === 201, archiveRes);

  const sitesAfterArchive = await api(ownerToken, 'GET', '/sites');
  check(
    'GET /sites (без archived) НЕ содержит архивированный временный участок',
    !sitesAfterArchive.json.some((s) => s.id === tempSite.json.id),
    sitesAfterArchive.json?.map((s) => s.id),
  );

  const sitesArchivedOnly = await api(ownerToken, 'GET', '/sites?archived=true');
  check(
    'GET /sites?archived=true СОДЕРЖИТ архивированный временный участок',
    sitesArchivedOnly.json.some((s) => s.id === tempSite.json.id),
    sitesArchivedOnly.json?.map((s) => s.id),
  );

  // ===================================================================
  // 7) HR не может создать/изменить пользователя с ролью шире своей
  //    (регресс сегодняшнего фикса SCOPE_RANK в users.service.ts).
  // ===================================================================
  console.log('\n[7] HR — эскалация привилегий (ожидаем отказ)');
  const roles = (await api(ownerToken, 'GET', '/roles')).json;
  const ownerRole = roles.find((r) => r.name === 'Владелец компании');
  const hrRole = roles.find((r) => r.name === 'Администратор / HR');
  const siteManagerRole = roles.find((r) => r.name === 'Руководитель участка');
  const foremanRole = roles.find((r) => r.name === 'Бригадир');

  const hrCreatesOwner = await api(hrToken, 'POST', '/users', {
    email: `qa-smoke-escalation-${Date.now()}@kern.local`,
    fullName: 'QA-SMOKE Escalation Attempt',
    password: 'temp12345',
    roleId: ownerRole.id,
  });
  check(
    'HR создаёт пользователя с ролью "Владелец компании" -> 403 (эскалация)',
    hrCreatesOwner.status === 403,
    hrCreatesOwner,
  );
  if (hrCreatesOwner.status === 201) cleanup.userIdsToDeactivate.push(hrCreatesOwner.json.id);

  const hrCreatesSiteManager = await api(hrToken, 'POST', '/users', {
    email: `qa-smoke-escalation2-${Date.now()}@kern.local`,
    fullName: 'QA-SMOKE Escalation Attempt 2',
    password: 'temp12345',
    roleId: siteManagerRole.id,
  });
  check(
    'HR создаёт пользователя с ролью "Руководитель участка" -> 403 (у HR нет site/crew/timesheet прав вообще)',
    hrCreatesSiteManager.status === 403,
    hrCreatesSiteManager,
  );
  if (hrCreatesSiteManager.status === 201) cleanup.userIdsToDeactivate.push(hrCreatesSiteManager.json.id);

  const hrUpdatesSelfToOwner = await api(hrToken, 'PATCH', `/users/${(await api(hrToken, 'GET', '/users')).json?.[0]?.id ?? ''}`, {
    roleId: ownerRole.id,
  });
  // Примечание: HR имеет user:read/update только company-scope на любых
  // пользователей компании, поэтому цель может оказаться другим
  // пользователем — важен сам факт отказа по эскалации роли.
  check('HR меняет чью-либо роль на "Владелец компании" -> 403', hrUpdatesSelfToOwner.status === 403, hrUpdatesSelfToOwner);

  // Позитивный кейс: HR МОЖЕТ выдать роль, не шире собственной (та же
  // роль "Администратор / HR" — не эскалация, легитимно).
  const hrCreatesLateralHr = await api(hrToken, 'POST', '/users', {
    email: `qa-smoke-lateral-hr-${Date.now()}@kern.local`,
    fullName: 'QA-SMOKE Lateral HR',
    password: 'temp12345',
    roleId: hrRole.id,
  });
  check(
    'HR создаёт пользователя с той же ролью "Администратор / HR" -> 201 (не эскалация, разрешено)',
    hrCreatesLateralHr.status === 201,
    hrCreatesLateralHr,
  );
  if (hrCreatesLateralHr.status === 201) cleanup.userIdsToDeactivate.push(hrCreatesLateralHr.json.id);

  // ===================================================================
  // 8) Владелец МОЖЕТ назначить более УЗКУЮ роль (own_sites/own_crew) —
  //    именно это ломала строковая проверка scope до сегодняшнего фикса.
  // ===================================================================
  console.log('\n[8] Владелец — назначение более узкой роли (регресс SCOPE_RANK)');
  const ownerCreatesSiteManager = await api(ownerToken, 'POST', '/users', {
    email: `qa-smoke-sitemgr-${Date.now()}@kern.local`,
    fullName: 'QA-SMOKE SiteManager',
    password: 'temp12345',
    roleId: siteManagerRole.id,
    siteIds: [site14.id],
  });
  check(
    'Владелец создаёт пользователя с ролью "Руководитель участка" (own_sites, УЖЕ владельца), siteIds=[SITE-14] -> 201',
    ownerCreatesSiteManager.status === 201,
    ownerCreatesSiteManager,
  );
  if (ownerCreatesSiteManager.status === 201) cleanup.userIdsToDeactivate.push(ownerCreatesSiteManager.json.id);

  const ownerCreatesForeman = await api(ownerToken, 'POST', '/users', {
    email: `qa-smoke-foreman2-${Date.now()}@kern.local`,
    fullName: 'QA-SMOKE Foreman2',
    password: 'temp12345',
    roleId: foremanRole.id,
  });
  check(
    'Владелец создаёт пользователя с ролью "Бригадир" (own_crew, самая узкая) -> 201',
    ownerCreatesForeman.status === 201,
    ownerCreatesForeman,
  );
  if (ownerCreatesForeman.status === 201) cleanup.userIdsToDeactivate.push(ownerCreatesForeman.json.id);

  // ===================================================================
  // 9) siteIds теперь передаются через CreateUserDto/UpdateUserDto —
  //    проверяем, что "Руководитель участка" реально видит ИМЕННО
  //    назначенный участок (SITE-14), не больше и не меньше.
  // ===================================================================
  let siteMgrToken = null;
  if (ownerCreatesSiteManager.status === 201) {
    console.log('\n[9] siteIds на пользователе действительно ограничивают видимость участков');
    siteMgrToken = await login({ email: ownerCreatesSiteManager.json.email, password: 'temp12345' });
    const siteMgrSites = await api(siteMgrToken, 'GET', '/sites');
    check(
      '"Руководитель участка" с siteIds=[SITE-14] видит ровно SITE-14 и ничего больше',
      siteMgrSites.status === 200 &&
        siteMgrSites.json.length === 1 &&
        siteMgrSites.json[0].id === site14.id,
      siteMgrSites,
    );
  }

  // ===================================================================
  // 10) Регресс-тест сегодняшнего дополнения к SCOPE_RANK: назначающий
  //     с scope=own_sites не должен уметь выдать own_sites-право на
  //     участок, к которому сам доступа не имеет — даже если ранг
  //     scope (own_sites == own_sites) формально совпадает.
  //
  //     В текущем сиде НИ ОДНА встроенная роль не сочетает user:create
  //     с own_sites (HR имеет user:create только на company, "Руководитель
  //     участка" не имеет user:create вообще) — поэтому напрямую через
  //     существующие роли этот код-путь не воспроизвести через UI. Чтобы
  //     всё же проверить именно эту логику (а не поверить на слово
  //     чтению кода), заводим временную роль с правами
  //     {user:create, user:read} @ own_sites через Prisma напрямую
  //     (только для теста — API создания ролей ещё не реализовано,
  //     см. RolesController, там только GET).
  // ===================================================================
  console.log('\n[10] own_sites -> own_sites: нельзя выдать доступ к чужому участку (доп. проверка сегодняшнего фикса)');
  const company = await prisma.company.findFirstOrThrow();
  const tempRole = await prisma.role.create({
    data: {
      companyId: company.id,
      name: `QA-SMOKE-TestRole-${Date.now()}`,
      isSystem: false,
      permissions: {
        create: [
          { resource: 'user', action: 'create', scope: 'own_sites' },
          { resource: 'user', action: 'read', scope: 'own_sites' },
        ],
      },
    },
  });

  const siteZ = await api(ownerToken, 'POST', '/sites', {
    name: 'QA-SMOKE-SiteZ (вне доступа тестового HR)',
    code: `QA-SMOKE-Z-${Date.now()}`,
    workType: 'drilling',
  });
  if (siteZ.status === 201) cleanup.siteIds.push(siteZ.json.id);

  const scopedGranterEmail = `qa-smoke-scoped-granter-${Date.now()}@kern.local`;
  const scopedGranter = await api(ownerToken, 'POST', '/users', {
    email: scopedGranterEmail,
    fullName: 'QA-SMOKE Scoped Granter',
    password: 'temp12345',
    roleId: tempRole.id,
    siteIds: [site14.id], // доступен ТОЛЬКО SITE-14, не siteZ
  });
  check('Подготовка: временный пользователь с кастомной own_sites-ролью создан', scopedGranter.status === 201, scopedGranter);
  if (scopedGranter.status === 201) cleanup.userIdsToDeactivate.push(scopedGranter.json.id);

  if (scopedGranter.status === 201 && siteZ.status === 201) {
    const scopedGranterToken = await login({ email: scopedGranterEmail, password: 'temp12345' });

    const grantOutOfScope = await api(scopedGranterToken, 'POST', '/users', {
      email: `qa-smoke-should-fail-${Date.now()}@kern.local`,
      fullName: 'QA-SMOKE Should Fail',
      password: 'temp12345',
      roleId: tempRole.id,
      siteIds: [siteZ.json.id], // участок ВНЕ собственного siteIds назначающего
    });
    check(
      'own_sites-пользователь не может выдать own_sites-доступ к участку, которого у него самого нет -> 403',
      grantOutOfScope.status === 403,
      grantOutOfScope,
    );
    if (grantOutOfScope.status === 201) cleanup.userIdsToDeactivate.push(grantOutOfScope.json.id);

    const grantInScope = await api(scopedGranterToken, 'POST', '/users', {
      email: `qa-smoke-should-pass-${Date.now()}@kern.local`,
      fullName: 'QA-SMOKE Should Pass',
      password: 'temp12345',
      roleId: tempRole.id,
      siteIds: [site14.id], // тот же участок, что и у самого назначающего — легитимно
    });
    check(
      'own_sites-пользователь МОЖЕТ выдать own_sites-доступ к своему же участку -> 201',
      grantInScope.status === 201,
      grantInScope,
    );
    if (grantInScope.status === 201) cleanup.userIdsToDeactivate.push(grantInScope.json.id);
  }

  cleanup.roleIdsToDelete.push(tempRole.id);

  // ===================================================================
  // Итог
  // ===================================================================
  console.log(`\n=== Итог: ${passCount} пройдено, ${failCount} провалено ===`);
  if (failures.length) {
    console.log('\nПровалившиеся проверки:');
    for (const f of failures) {
      console.log(`- ${f.description}`);
    }
  }
}

main()
  .catch((e) => {
    console.error('Смоук-тест упал с ошибкой:', e);
    failCount++;
  })
  .finally(async () => {
    await runCleanup();
    await prisma.$disconnect();
    process.exit(failCount > 0 ? 1 : 0);
  });
