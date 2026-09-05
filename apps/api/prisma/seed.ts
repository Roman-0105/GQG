/**
 * Сид базовых ролей из docs/project-plan.md (раздел 2) для демо-компании.
 * Запуск: npx prisma db seed (после prisma migrate dev).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type PermissionSeed = { resource: string; action: string; scope: 'own_crew' | 'own_sites' | 'company' };

const ROLE_PERMISSIONS: Record<string, PermissionSeed[]> = {
  'Владелец компании': [
    ...([
      'site',
      'crew',
      'employee',
      'timesheet',
      'payroll',
      'rate_rule',
      'role',
      'user',
      'position',
      'analytics',
    ].flatMap((resource) =>
      ['create', 'read', 'update', 'approve', 'lock', 'delete', 'export'].map((action) => ({
        resource,
        action,
        scope: 'company' as const,
      })),
    )),
  ],
  'Администратор / HR': [
    { resource: 'employee', action: 'create', scope: 'company' },
    { resource: 'employee', action: 'read', scope: 'company' },
    { resource: 'employee', action: 'update', scope: 'company' },
    { resource: 'role', action: 'read', scope: 'company' },
    { resource: 'user', action: 'create', scope: 'company' },
    { resource: 'user', action: 'read', scope: 'company' },
    { resource: 'position', action: 'create', scope: 'company' },
    { resource: 'position', action: 'read', scope: 'company' },
  ],
  'Руководитель участка': [
    { resource: 'site', action: 'read', scope: 'own_sites' },
    { resource: 'crew', action: 'create', scope: 'own_sites' },
    { resource: 'crew', action: 'read', scope: 'own_sites' },
    { resource: 'employee', action: 'create', scope: 'own_sites' },
    { resource: 'employee', action: 'read', scope: 'own_sites' },
    { resource: 'position', action: 'read', scope: 'company' },
    { resource: 'user', action: 'read', scope: 'company' },
    { resource: 'timesheet', action: 'read', scope: 'own_sites' },
    { resource: 'timesheet', action: 'approve', scope: 'own_sites' },
    { resource: 'timesheet', action: 'lock', scope: 'own_sites' },
    { resource: 'analytics', action: 'read', scope: 'own_sites' },
  ],
  Бригадир: [
    { resource: 'timesheet', action: 'create', scope: 'own_crew' },
    { resource: 'timesheet', action: 'read', scope: 'own_crew' },
    { resource: 'timesheet', action: 'update', scope: 'own_crew' },
  ],
  'Расчётчик / бухгалтер': [
    { resource: 'rate_rule', action: 'create', scope: 'company' },
    { resource: 'rate_rule', action: 'read', scope: 'company' },
    { resource: 'rate_rule', action: 'update', scope: 'company' },
    { resource: 'position', action: 'read', scope: 'company' },
    { resource: 'employee', action: 'read', scope: 'company' },
    { resource: 'payroll', action: 'create', scope: 'company' },
    { resource: 'payroll', action: 'read', scope: 'company' },
    { resource: 'payroll', action: 'export', scope: 'company' },
    { resource: 'analytics', action: 'read', scope: 'company' },
  ],
  Работник: [
    { resource: 'timesheet', action: 'read', scope: 'own_crew' },
  ],
  Аудитор: [
    ...([
      'site',
      'crew',
      'employee',
      'timesheet',
      'payroll',
      'rate_rule',
      'user',
      'position',
      'analytics',
    ].map((resource) => ({
      resource,
      action: 'read' as const,
      scope: 'company' as const,
    }))),
  ],
};

async function main() {
  const company = await prisma.company.upsert({
    where: { id: 'demo-company' },
    update: {},
    create: { id: 'demo-company', name: 'Демо-компания КЕРН', currency: 'RUB' },
  });

  for (const [roleName, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId: company.id, name: roleName } },
      update: {},
      create: { companyId: company.id, name: roleName, isSystem: true },
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

  const ownerRole = await prisma.role.findUniqueOrThrow({
    where: { companyId_name: { companyId: company.id, name: 'Владелец компании' } },
  });

  const ownerPasswordHash = await bcrypt.hash('change-me-now', 10);
  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.kern' },
    update: {},
    create: {
      companyId: company.id,
      email: 'owner@demo.kern',
      passwordHash: ownerPasswordHash,
      fullName: 'Демо Владелец',
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
  console.log('Сид завершён. Демо-логин: owner@demo.kern / change-me-now (сменить перед реальным использованием).');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
