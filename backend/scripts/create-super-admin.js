#!/usr/bin/env node
/**
 * Creates the first (or another) Noxtill Super Admin account.
 *
 *   cd backend
 *   node scripts/create-super-admin.js --email you@noxtill.com --name "Your Name"
 *
 * Prints a one-time temporary password. At first sign-in at /super-admin/login the admin must
 * enroll an authenticator app (TOTP) — there is no way to use the console without it.
 * Only the bcrypt hash of the password is stored. Refuses if the email already exists.
 */
try {
  // Present via @nestjs/config; load backend/.env when run locally.
  require('dotenv').config();
} catch {
  /* env already provided by the host */
}
// Same DATABASE_URL normalisation the API applies at boot (Hostinger panel quirks), when built.
for (const p of ['../dist/prisma/resolve-database-url', '../dist/src/prisma/resolve-database-url']) {
  try {
    require(p).resolveDatabaseUrl();
    break;
  } catch {
    /* not built — DATABASE_URL is used as-is */
  }
}
const { randomBytes } = require('crypto');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = (arg('email') || '').trim().toLowerCase();
  const name = (arg('name') || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    console.error('Usage: node scripts/create-super-admin.js --email <email> --name "<name>"');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    await prisma.platformAdminRole.upsert({
      where: { key: 'super_admin' },
      create: {
        key: 'super_admin',
        name: 'Super Admin',
        description: 'Full platform administration. Always holds every permission.',
        // The API always resolves super_admin to every permission; this column is informational.
        permissions: [],
        isSystem: true,
      },
      update: {},
    });
    if (await prisma.platformAdmin.findUnique({ where: { email } })) {
      console.error(`An admin with ${email} already exists.`);
      process.exit(1);
    }
    const password = `${randomBytes(12).toString('base64url')}Aa1`;
    const admin = await prisma.platformAdmin.create({
      data: {
        email,
        name,
        roleKey: 'super_admin',
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    // The CLI bootstrap is itself a privileged action — record it like any other.
    await prisma.platformAuditLog.create({
      data: {
        adminId: null,
        adminEmail: 'cli:create-super-admin',
        action: 'admin.created',
        resourceType: 'admin',
        resourceId: admin.id,
        after: { email, name, role: 'super_admin' },
        reason: 'Super Admin created from the server command line',
      },
    });
    console.log('\nSuper Admin created.');
    console.log(`  Email:              ${email}`);
    console.log(`  Temporary password: ${password}`);
    console.log('\nSign in at /super-admin/login and enroll an authenticator app when asked.\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
