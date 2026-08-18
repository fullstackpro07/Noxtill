const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = 'u721189487_NoxtillDB' AND table_type = 'BASE TABLE'",
  );
  const migrations = await prisma.$queryRawUnsafe(
    'SELECT migration_name, finished_at FROM `_prisma_migrations` ORDER BY finished_at',
  );
  const businesses = await prisma.business.count();
  console.log(
    JSON.stringify({ tables, migrations, businesses }, (_, v) =>
      typeof v === 'bigint' ? Number(v) : v,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
