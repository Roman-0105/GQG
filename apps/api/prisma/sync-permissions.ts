/**
 * Доводит каталог ролей/прав (ROLE_PERMISSIONS в seed.ts) до актуального
 * состояния на ВСЕХ существующих компаниях в БД — не трогает ничего,
 * кроме таблиц Role/Permission (upsert, ничего не удаляет).
 *
 * Нужен отдельно от `npx prisma db seed`, потому что полный seed.ts
 * создаёт ещё и демо-логин/должности/участок — то, что должно
 * появляться только на пустой БД, а не при обновлении прав на уже
 * работающей компании с реальными данными.
 *
 * Запуск: npx ts-node prisma/sync-permissions.ts
 */
import { PrismaClient } from '@prisma/client';
import { seedRolesAndPermissions } from './seed';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const company of companies) {
    await seedRolesAndPermissions(company.id);
    // eslint-disable-next-line no-console
    console.log(`Права синхронизированы: ${company.name} (${company.id})`);
  }
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
