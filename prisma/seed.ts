/**
 * Prisma Seed Script — Autoflow Foundation
 *
 * Creates:
 * - 1 Admin user (admin / Admin@123)
 * - 1 test user per role (CASHIER, STORE, SUPERVISOR, MANAGER, CFO, ADMIN)
 * - Master data: items, warehouses, vendors, customers, roles, periods
 *
 * Uses upsert pattern for idempotency — safe to run multiple times.
 */

import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { seedMasterData } from './seed-master-data';

const connectionString =
  process.env['DATABASE_URL'] ??
  'postgresql://autoflow:autoflow_secret@localhost:6432/autoflow?schema=public';

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = 'admin123';
const BCRYPT_ROUNDS = 10;

interface SeedUser {
  username: string;
  email: string;
  displayName: string;
  roles: Role[];
}

const seedUsers: SeedUser[] = [
  {
    username: 'admin',
    email: 'admin@autoflow.local',
    displayName: 'System Administrator',
    roles: [Role.ADMIN],
  },
  {
    username: 'cashier01',
    email: 'cashier01@autoflow.local',
    displayName: 'Test Cashier',
    roles: [Role.CASHIER],
  },
  {
    username: 'store01',
    email: 'store01@autoflow.local',
    displayName: 'Test Store Staff',
    roles: [Role.STORE],
  },
  {
    username: 'supervisor01',
    email: 'supervisor01@autoflow.local',
    displayName: 'Test Supervisor',
    roles: [Role.SUPERVISOR],
  },
  {
    username: 'manager01',
    email: 'manager01@autoflow.local',
    displayName: 'Test Manager',
    roles: [Role.MANAGER],
  },
  {
    username: 'cfo01',
    email: 'cfo01@autoflow.local',
    displayName: 'Test CFO',
    roles: [Role.CFO],
  },
];

async function main(): Promise<void> {
  console.log('🌱 Seeding Autoflow database...\n');

  // ─── Phase 1: Users ─────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  for (const user of seedUsers) {
    const result = await prisma.user.upsert({
      where: { username: user.username },
      update: {
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
        isActive: true,
      },
      create: {
        username: user.username,
        email: user.email,
        passwordHash,
        displayName: user.displayName,
        roles: user.roles,
        isActive: true,
      },
    });

    console.log(
      `  ✓ ${result.username} (${result.roles.join(', ')}) — ${result.id}`
    );
  }

  console.log(`\n✅ Seeded ${seedUsers.length} users successfully.`);
  console.log(`   Default password: ${DEFAULT_PASSWORD}`);

  // ─── Phase 2: Master Data ───────────────────────────────────────────────────
  await seedMasterData(prisma);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
