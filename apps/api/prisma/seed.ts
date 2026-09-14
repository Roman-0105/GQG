/**
 * Сид базовых ролей из docs/project-plan.md (раздел 2) для демо-компании.
 * Запуск: npx prisma db seed (после prisma migrate dev).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type PermissionSeed = { resource: string; action: string; scope: 'own_crew' | 'own_sites' | 'company' };

const ROLE_PERMISSIONS: Record<string, PermissionSeed[]> = {
  // Владелец компании и руководитель участка объединены в одну роль —
  // в реальной компании это один и тот же человек (найдено при
  // тестировании владельцем). Полный доступ ко всем ресурсам компании;
  // у него намеренно нет отдельного understanding "своей бригады" —
  // он не бригадир, табель за смену не ведёт и не должен быть назначен
  // Crew.foremanId (own_crew-права ему не нужны и не выдаются).
  'Начальник участка': [
    ...([
      'site',
      'crew',
      'employee',
      'timesheet',
      'timesheet_period',
      'payroll',
      'rate_rule',
      'role',
      'user',
      'position',
      'analytics',
      'task',
    ].flatMap((resource) =>
      ['create', 'read', 'update', 'approve', 'lock', 'delete', 'export'].map((action) => ({
        resource,
        action,
        scope: 'company' as const,
      })),
    )),
  ],
  // Отвечает за расчёт зарплаты и правила расчёта; вместе с
  // начальником участка согласовывает табели (approve/lock — как и у
  // него, только на действия табеля, не на административные разделы) —
  // после отказа от отдельного двухподписного согласования табеля за
  // период (см. TimesheetPeriodsService) согласование теперь одно, на
  // уровне ежедневных записей, и бухгалтер в нём участвует наравне с
  // начальником участка. site/crew:read — только чтобы найти нужный
  // табель в разделе «Табеля» (участок → бригада → табели), не для
  // администрирования.
  Бухгалтер: [
    { resource: 'site', action: 'read', scope: 'company' },
    { resource: 'crew', action: 'read', scope: 'company' },
    { resource: 'employee', action: 'read', scope: 'company' },
    { resource: 'position', action: 'read', scope: 'company' },
    { resource: 'rate_rule', action: 'create', scope: 'company' },
    { resource: 'rate_rule', action: 'read', scope: 'company' },
    { resource: 'rate_rule', action: 'update', scope: 'company' },
    { resource: 'payroll', action: 'create', scope: 'company' },
    { resource: 'payroll', action: 'read', scope: 'company' },
    { resource: 'payroll', action: 'export', scope: 'company' },
    { resource: 'timesheet_period', action: 'read', scope: 'company' },
    { resource: 'timesheet_period', action: 'approve', scope: 'company' },
    { resource: 'timesheet', action: 'read', scope: 'company' },
    { resource: 'timesheet', action: 'approve', scope: 'company' },
    { resource: 'timesheet', action: 'lock', scope: 'company' },
    { resource: 'analytics', action: 'read', scope: 'company' },
  ],
  // Ведёт табель только своей бригады: формирует табель за период,
  // ежедневно вносит часы/метраж и отправляет на согласование
  // начальнику участка/бухгалтеру. Не согласовывает ничего сам — нет
  // action:'approve' ни на что.
  Бригадир: [
    { resource: 'timesheet', action: 'create', scope: 'own_crew' },
    { resource: 'timesheet', action: 'read', scope: 'own_crew' },
    { resource: 'timesheet', action: 'update', scope: 'own_crew' },
    { resource: 'timesheet_period', action: 'create', scope: 'own_crew' },
    { resource: 'timesheet_period', action: 'read', scope: 'own_crew' },
    { resource: 'timesheet_period', action: 'update', scope: 'own_crew' },
    { resource: 'analytics', action: 'read', scope: 'own_crew' },
  ],
};

/**
 * Только каталог ролей/прав — ничего похожего на "тестовые данные"
 * (демо-пользователь, участок, должности). Вынесено отдельной функцией,
 * чтобы можно было довести ROLE_PERMISSIONS до актуального состояния на
 * уже работающей (не демо) компании через prisma/sync-permissions.ts,
 * не запуская весь seed.ts заново — иначе он пересоздал бы демо-логин
 * owner@demo.kern и демо-должности, которые пользователь уже удалил
 * (найдено на Этапе 06, при добавлении TimesheetPeriod).
 */
export async function seedRolesAndPermissions(companyId: string) {
  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId, name: roleName } },
      update: {},
      create: { companyId, name: roleName, isSystem: true },
    });

    for (const permission of permissions) {
      await prisma.permission.upsert({
        where: {
          roleId_resource_action_scope: {
            roleId: role.id,
            resource: permission.resource,
            action: permission.action,
            scope: permission.scope,
          },
        },
        update: {},
        create: { roleId: role.id, ...permission },
      });
    }
  }
}

async function main() {
  const company = await prisma.company.upsert({
    where: { id: 'demo-company' },
    update: {},
    create: { id: 'demo-company', name: 'Демо-компания КЕРН', currency: 'RUB' },
  });

  await seedRolesAndPermissions(company.id);

  const ownerRole = await prisma.role.findUniqueOrThrow({
    where: { companyId_name: { companyId: company.id, name: 'Начальник участка' } },
  });

  // Логин владельца — email настоящий (не секрет сам по себе), но
  // ПАРОЛЬ намеренно НЕ хранится в коде как литерал: репозиторий
  // публичный на GitHub, а реальный пароль в открытом виде в истории
  // git — это скомпрометированный пароль в ту же секунду, как коммит
  // запушен (см. инцидент 14.09.2026 — пароль утёк, пришлось сразу
  // менять на живой системе). Задаётся только через переменную
  // окружения SEED_OWNER_PASSWORD в .env (см. .env.example), без
  // значения по умолчанию — сид явно падает, если её не задали, а не
  // тихо создаёт логин со слабым паролем-заглушкой.
  const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'Roman@gmail.com';
  const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD;
  if (!OWNER_PASSWORD) {
    throw new Error(
      'SEED_OWNER_PASSWORD не задан — укажите его в .env перед запуском seed (см. .env.example). ' +
        'Пароль владельца намеренно не хранится в коде.',
    );
  }
  const ownerPasswordHash = await bcrypt.hash(OWNER_PASSWORD, 10);
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: {
      companyId: company.id,
      email: OWNER_EMAIL,
      passwordHash: ownerPasswordHash,
      fullName: 'Roman',
    },
  });

  await prisma.roleAssignment.upsert({
    where: { userId_roleId: { userId: owner.id, roleId: ownerRole.id } },
    update: {},
    create: { userId: owner.id, roleId: ownerRole.id },
  });

  const DEFAULT_POSITIONS: { name: string; baseHourlyRate: number; hazardPay?: boolean }[] = [
    { name: 'Бурильщик', baseHourlyRate: 450, hazardPay: true },
    { name: 'Помощник бурильщика', baseHourlyRate: 320, hazardPay: true },
    { name: 'Геолог', baseHourlyRate: 500 },
    { name: 'Инженер-геотехник', baseHourlyRate: 520 },
    { name: 'Машинист буровой установки', baseHourlyRate: 480, hazardPay: true },
    { name: 'Разнорабочий', baseHourlyRate: 250 },
  ];

  for (const position of DEFAULT_POSITIONS) {
    await prisma.position.upsert({
      where: { companyId_name: { companyId: company.id, name: position.name } },
      update: {},
      create: { companyId: company.id, ...position },
    });
  }

  // Обязательный wildcard-правило компании (siteId=null, positionId=null,
  // priority=0) — движок расчёта (docs/payroll-formulas.md, D11) требует,
  // чтобы для каждого табеля нашлось хотя бы одно применимое RateRule,
  // иначе расчёт зарплаты падает ошибкой валидации. У RateRule нет
  // уникального ключа для upsert — проверяем существование вручную.
  const hasWildcardRule = await prisma.rateRule.findFirst({
    where: { companyId: company.id, siteId: null, positionId: null },
  });
  if (!hasWildcardRule) {
    await prisma.rateRule.create({
      data: {
        companyId: company.id,
        name: 'Базовые условия (без надбавок)',
        priority: 0,
        // Проценты/суммы — 0 по умолчанию (см. поля модели); реальные
        // значения задаёт владелец компании на странице «Правила
        // расчёта», когда региональные нормы будут подтверждены
        // (docs/project-plan.md, раздел 10, пункт 1).
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Сид завершён. Логин владельца: ${OWNER_EMAIL} (пароль — см. SEED_OWNER_PASSWORD/значение по умолчанию в seed.ts).`);
}

// Guard — этот файл теперь также импортируется как модуль ради
// seedRolesAndPermissions (см. prisma/sync-permissions.ts); без этой
// проверки такой импорт заново запускал бы демо-сид (в т.ч. пересоздал
// бы owner@demo.kern) при каждом обращении.
if (require.main === module) {
  main()
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
