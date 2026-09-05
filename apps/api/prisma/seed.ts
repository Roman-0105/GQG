/**
 * Сид базовых ролей из docs/project-plan.md (раздел 2) для демо-компании.
 * Запуск: npx prisma db seed (после prisma migrate dev).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type PermissionSeed = { resource: string; action: string; scope: 'own_crew' | 'own_sites' | 'company' };

const ROLE_PERMISSIONS: Record<string, PermissionSeed[]> = {
  'Владелец компании': [
    ...(['site', 'crew', 'employee', 'timesheet', 'payroll', 'rate_rule', 'role', 'analytics'].flatMap((resource) =>
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
  ],
  'Руководитель участка': [
    { resource: 'site', action: 'read', scope: 'own_sites' },
    { resource: 'crew', action: 'create', scope: 'own_sites' },
    { resource: 'crew', action: 'read', scope: 'own_sites' },
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
    { resource: 'rate_rule', action: 'update', scope: 'company' },
    { resource: 'payroll', action: 'create', scope: 'company' },
    { resource: 'payroll', action: 'read', scope: 'company' },
    { resource: 'payroll', action: 'export', scope: 'company' },
  ],
  Работник: [
    { resource: 'timesheet', action: 'read', scope: 'own_crew' },
  ],
  Аудитор: [
    ...(['site', 'crew', 'employee', 'timesheet', 'payroll', 'rate_rule', 'analytics'].map((resource) => ({
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
