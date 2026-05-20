/**
 * Master Data Seed Script — Autoflow
 *
 * Seeds development data for master_data schema:
 * - 6 roles (RoleRecord table)
 * - 10 items
 * - 3 warehouses
 * - 5 vendors
 * - 5 customers
 * - 3 periods (2 open, 1 closed)
 * - 6 user-role assignments (UserRole bridge)
 *
 * Uses upsert pattern for idempotency — safe to run multiple times.
 * Must run AFTER user seed (depends on admin user for period ownership).
 */

import { PrismaClient, Role } from '@prisma/client';

// ─── Role Records ─────────────────────────────────────────────────────────────

const roleRecords = [
  { name: 'CASHIER', description: 'Processes sales, issues invoices and receipts' },
  { name: 'STORE', description: 'Receives goods, manages warehouse intake' },
  { name: 'SUPERVISOR', description: 'Approves returns, transfers, stock adjustments' },
  { name: 'MANAGER', description: 'Approves Credit Notes, AP payments, VOIDs' },
  { name: 'CFO', description: 'Period management, write-off approvals' },
  { name: 'ADMIN', description: 'System configuration, user and master data management' },
];

// ─── Items ────────────────────────────────────────────────────────────────────

const items = [
  { code: 'ITM-001', name: 'กระดาษ A4 80 แกรม', unit: 'รีม', category: 'อุปกรณ์สำนักงาน' },
  { code: 'ITM-002', name: 'หมึกพิมพ์ HP 680 สีดำ', unit: 'ตลับ', category: 'อุปกรณ์สำนักงาน' },
  { code: 'ITM-003', name: 'น้ำมันเครื่อง 5W-30', unit: 'ลิตร', category: 'อะไหล่ยานยนต์' },
  { code: 'ITM-004', name: 'ยางรถยนต์ 205/55R16', unit: 'เส้น', category: 'อะไหล่ยานยนต์' },
  { code: 'ITM-005', name: 'ปูนซีเมนต์ปอร์ตแลนด์', unit: 'ถุง', category: 'วัสดุก่อสร้าง' },
  { code: 'ITM-006', name: 'เหล็กเส้น DB16', unit: 'เส้น', category: 'วัสดุก่อสร้าง' },
  { code: 'ITM-007', name: 'สายไฟ THW 2.5 sq.mm', unit: 'เมตร', category: 'ไฟฟ้า' },
  { code: 'ITM-008', name: 'ท่อ PVC 1/2 นิ้ว', unit: 'เส้น', category: 'ประปา' },
  { code: 'ITM-009', name: 'น็อตสแตนเลส M8x30', unit: 'ตัว', category: 'ฮาร์ดแวร์' },
  { code: 'ITM-010', name: 'สีน้ำอะคริลิค ขาว 5 กล.', unit: 'ถัง', category: 'สี' },
];

// ─── Warehouses ───────────────────────────────────────────────────────────────

const warehouses = [
  { code: 'WH-001', name: 'คลังสินค้าหลัก', location: 'อาคาร A ชั้น 1' },
  { code: 'WH-002', name: 'คลังสินค้าสำรอง', location: 'อาคาร B ชั้น 2' },
  { code: 'WH-003', name: 'คลังวัตถุดิบ', location: 'โกดัง C' },
];

// ─── Vendors ──────────────────────────────────────────────────────────────────

const vendors = [
  {
    code: 'VND-001',
    name: 'บจก. ซัพพลายไทย',
    taxId: '0105500012345',
    address: '123 ถ.พระราม 4 แขวงคลองเตย เขตคลองเตย กทม. 10110',
    phone: '02-123-4567',
    email: 'sales@supplythai.co.th',
  },
  {
    code: 'VND-002',
    name: 'บจก. อุปกรณ์ออฟฟิศ',
    taxId: '0105500023456',
    address: '456 ถ.สุขุมวิท แขวงบางนา เขตบางนา กทม. 10260',
    phone: '02-234-5678',
    email: 'contact@officesupply.co.th',
  },
  {
    code: 'VND-003',
    name: 'หจก. วัสดุก่อสร้างรวม',
    taxId: '0105500034567',
    address: '789 ถ.พหลโยธิน แขวงลาดยาว เขตจตุจักร กทม. 10900',
    phone: '02-345-6789',
    email: 'info@buildmat.co.th',
  },
  {
    code: 'VND-004',
    name: 'บจก. ไฟฟ้าเจริญ',
    taxId: '0105500045678',
    address: '101 ถ.เพชรบุรี แขวงมักกะสัน เขตราชเทวี กทม. 10400',
    phone: '02-456-7890',
    email: 'sales@electricpro.co.th',
  },
  {
    code: 'VND-005',
    name: 'บจก. อะไหล่ยนต์',
    taxId: '0105500056789',
    address: '202 ถ.รามคำแหง แขวงหัวหมาก เขตบางกะปิ กทม. 10240',
    phone: '02-567-8901',
    email: 'parts@autoparts.co.th',
  },
];

// ─── Customers ────────────────────────────────────────────────────────────────

const customers = [
  {
    code: 'CUS-001',
    name: 'บจก. รับเหมาทอง',
    taxId: '0105500067890',
    address: '111 ถ.ลาดพร้าว แขวงจอมพล เขตจตุจักร กทม. 10900',
    phone: '02-678-9012',
    email: 'info@goldcontract.co.th',
  },
  {
    code: 'CUS-002',
    name: 'บจก. พัฒนาที่ดิน เอ',
    taxId: '0105500078901',
    address: '222 ถ.รัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กทม. 10310',
    phone: '02-789-0123',
    email: 'dev@landdev-a.co.th',
  },
  {
    code: 'CUS-003',
    name: 'นาย สมชาย ใจดี (ร้านค้า)',
    taxId: '1100500123456',
    address: '333 ตลาดนัด ถ.นวมินทร์ เขตบึงกุ่ม กทม. 10230',
    phone: '089-123-4567',
    email: 'somchai@shop.com',
  },
  {
    code: 'CUS-004',
    name: 'บจก. โรงแรมสยาม',
    taxId: '0105500089012',
    address: '444 ถ.สีลม แขวงสีลม เขตบางรัก กทม. 10500',
    phone: '02-890-1234',
    email: 'purchasing@siamhotel.co.th',
  },
  {
    code: 'CUS-005',
    name: 'บจก. ก่อสร้างมั่นคง',
    taxId: '0105500090123',
    address: '555 ถ.งามวงศ์วาน แขวงลาดยาว เขตจตุจักร กทม. 10900',
    phone: '02-901-2345',
    email: 'office@strongbuild.co.th',
  },
];

// ─── Seed Function ────────────────────────────────────────────────────────────

export async function seedMasterData(prisma: PrismaClient): Promise<void> {
  console.log('\n🏗️  Seeding master data...\n');

  // 1. Seed RoleRecords
  console.log('  📋 Seeding roles...');
  const roleIds: Record<string, string> = {};
  for (const role of roleRecords) {
    const record = await prisma.roleRecord.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: { name: role.name, description: role.description },
    });
    roleIds[role.name] = record.id;
    console.log(`    ✓ ${record.name} — ${record.id}`);
  }

  // 2. Seed Items
  console.log('  📦 Seeding items...');
  for (const item of items) {
    const record = await prisma.item.upsert({
      where: { code: item.code },
      update: { name: item.name, unit: item.unit, category: item.category },
      create: item,
    });
    console.log(`    ✓ ${record.code} — ${record.name}`);
  }

  // 3. Seed Warehouses
  console.log('  🏭 Seeding warehouses...');
  for (const wh of warehouses) {
    const record = await prisma.warehouse.upsert({
      where: { code: wh.code },
      update: { name: wh.name, location: wh.location },
      create: wh,
    });
    console.log(`    ✓ ${record.code} — ${record.name}`);
  }

  // 4. Seed Vendors
  console.log('  🤝 Seeding vendors...');
  for (const vendor of vendors) {
    const record = await prisma.vendor.upsert({
      where: { code: vendor.code },
      update: {
        name: vendor.name,
        taxId: vendor.taxId,
        address: vendor.address,
        phone: vendor.phone,
        email: vendor.email,
      },
      create: vendor,
    });
    console.log(`    ✓ ${record.code} — ${record.name}`);
  }

  // 5. Seed Customers
  console.log('  👥 Seeding customers...');
  for (const customer of customers) {
    const record = await prisma.customer.upsert({
      where: { code: customer.code },
      update: {
        name: customer.name,
        taxId: customer.taxId,
        address: customer.address,
        phone: customer.phone,
        email: customer.email,
      },
      create: customer,
    });
    console.log(`    ✓ ${record.code} — ${record.name}`);
  }

  // 6. Seed UserRole bridge table (link existing users to RoleRecords)
  console.log('  🔗 Seeding user-role assignments...');
  const userRoleMappings: { username: string; roleName: string }[] = [
    { username: 'cashier01', roleName: 'CASHIER' },
    { username: 'store01', roleName: 'STORE' },
    { username: 'supervisor01', roleName: 'SUPERVISOR' },
    { username: 'manager01', roleName: 'MANAGER' },
    { username: 'cfo01', roleName: 'CFO' },
    { username: 'admin', roleName: 'ADMIN' },
  ];

  for (const mapping of userRoleMappings) {
    const user = await prisma.user.findUnique({
      where: { username: mapping.username },
    });
    if (!user) {
      console.log(`    ⚠ User ${mapping.username} not found, skipping role assignment`);
      continue;
    }

    const roleId = roleIds[mapping.roleName];
    if (!roleId) {
      console.log(`    ⚠ Role ${mapping.roleName} not found, skipping`);
      continue;
    }

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
    console.log(`    ✓ ${mapping.username} → ${mapping.roleName}`);
  }

  // 7. Seed Periods (2 open, 1 closed)
  console.log('  📅 Seeding periods...');
  const adminUser = await prisma.user.findUnique({
    where: { username: 'admin' },
  });

  if (!adminUser) {
    console.log('    ⚠ Admin user not found — skipping period seed');
    return;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  // Period 1: Previous month (CLOSED)
  const closedMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const closedYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const closedPeriodStr = `${closedYear}-${String(closedMonth).padStart(2, '0')}`;

  const closedAt = new Date(currentYear, currentMonth - 1, 1); // 1st of current month
  await prisma.period.upsert({
    where: { period: closedPeriodStr },
    update: { status: 'CLOSED', closedBy: adminUser.id, closedAt },
    create: {
      period: closedPeriodStr,
      status: 'CLOSED',
      openedBy: adminUser.id,
      openedAt: new Date(closedYear, closedMonth - 1, 1),
      closedBy: adminUser.id,
      closedAt,
    },
  });
  console.log(`    ✓ ${closedPeriodStr} — CLOSED`);

  // Period 2: Current month (OPEN)
  const currentPeriodStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  await prisma.period.upsert({
    where: { period: currentPeriodStr },
    update: { status: 'OPEN' },
    create: {
      period: currentPeriodStr,
      status: 'OPEN',
      openedBy: adminUser.id,
      openedAt: new Date(currentYear, currentMonth - 1, 1),
    },
  });
  console.log(`    ✓ ${currentPeriodStr} — OPEN`);

  // Period 3: Next month (OPEN)
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
  const nextPeriodStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
  await prisma.period.upsert({
    where: { period: nextPeriodStr },
    update: { status: 'OPEN' },
    create: {
      period: nextPeriodStr,
      status: 'OPEN',
      openedBy: adminUser.id,
      openedAt: new Date(nextYear, nextMonth - 1, 1),
    },
  });
  console.log(`    ✓ ${nextPeriodStr} — OPEN`);

  console.log('\n✅ Master data seeded successfully.');
  console.log(`   Items: ${items.length}, Warehouses: ${warehouses.length}, Vendors: ${vendors.length}, Customers: ${customers.length}`);
  console.log(`   Roles: ${roleRecords.length}, Periods: 3 (2 open, 1 closed)`);
}
