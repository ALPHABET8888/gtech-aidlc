# Data Model — Unit: transactions (ข้อมูลพื้นฐาน)

## Overview
**Database**: PostgreSQL (single DB, `transactions` schema)
**ORM**: Prisma (schema-first, multi-schema support)
**Schema**: `transactions` — owned by Team 2

Cross-schema read access: `transactions` CAN read from `master_data` schema (items, warehouses, vendors, customers)

---

## Entities

### JobOrder

**Purpose**: Tracking document สำหรับ service/repair work — ไม่สร้าง TX Log entry (document only)

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | PK | Unique identifier |
| joNumber | String | Yes | Unique, auto-gen | JO running number (JO-YYYYMM-XXXX) |
| customerId | UUID | Yes | FK (mock) | Reference to customer |
| status | Enum(JOStatus) | Yes | Default: OPEN | OPEN → IN_PROGRESS → DONE |
| hasTempDo | Boolean | Yes | Default: false | Flag for path determination |
| tempDoId | UUID | No | FK → TxEntry | Reference to TEMP_DO TX (if Path A) |
| invoiceId | UUID | No | FK → TxEntry | Reference to Invoice TX |
| items | Json | Yes | — | Array of { itemId, qty, unitPrice, description } |
| totalAmount | Decimal(12,2) | Yes | ≥ 0 | Total before VAT |
| vatAmount | Decimal(12,2) | Yes | ≥ 0 | VAT amount |
| grandTotal | Decimal(12,2) | Yes | ≥ 0 | Total including VAT |
| notes | String | No | — | Additional notes |
| createdBy | UUID | Yes | — | User who created |
| createdAt | DateTime | Yes | Auto | Creation timestamp |
| updatedAt | DateTime | Yes | Auto | Last update timestamp |

**Indexes**:
- Unique: `joNumber`
- Index: `customerId`
- Index: `status`
- Composite: `[status, createdAt]` — for list queries with status filter

**Business Rules**:
1. Status transitions: OPEN → IN_PROGRESS → DONE only (no skip, no reverse)
2. Cannot issue TEMP_DO/Invoice unless status = DONE
3. Only one TEMP_DO per JO (`hasTempDo` flag)
4. Only one Invoice per JO (`invoiceId` null check)

---

### APOpenItem

**Purpose**: Accounts Payable open item — tracks supplier debt lifecycle

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | PK | Unique identifier |
| vendorId | UUID | Yes | FK (mock) | Supplier reference |
| txId | UUID | Yes | FK → TxEntry (mock) | Source TX that created this AP |
| txType | Enum(TxType) | Yes | — | Source TX type (GR_RECEIVE) |
| originalAmount | Decimal(12,2) | Yes | > 0 | Original AP amount |
| remainingAmount | Decimal(12,2) | Yes | ≥ 0 | Current outstanding balance |
| vatAmount | Decimal(12,2) | Yes | ≥ 0 | VAT portion |
| status | Enum(ApArStatus) | Yes | Default: OPEN | OPEN → PARTIAL → CLOSED |
| taxInvoiceNo | String | Yes | — | Supplier tax invoice number |
| dueDate | DateTime | No | — | Payment due date |
| period | String | Yes | YYYY-MM | Accounting period |
| createdAt | DateTime | Yes | Auto | Creation timestamp |
| updatedAt | DateTime | Yes | Auto | Last update timestamp |

**Relationships**:
- Has Many: `APPaymentAllocation` via `apOpenItemId`

**Indexes**:
- Index: `vendorId`
- Index: `status`
- Composite: `[vendorId, status]` — for vendor open items query
- Composite: `[status, dueDate]` — for aging report

**Business Rules**:
1. Status = CLOSED when `remainingAmount = 0`
2. Status = PARTIAL when `0 < remainingAmount < originalAmount`
3. CN reduction updates `remainingAmount` and may change status
4. Payment allocation updates `remainingAmount`

---

### AROpenItem

**Purpose**: Accounts Receivable open item — tracks customer debt lifecycle

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | PK | Unique identifier |
| customerId | UUID | Yes | FK (mock) | Customer reference |
| txId | UUID | Yes | FK → TxEntry (mock) | Source TX (SALE_INVOICE/TEMP_DO) |
| txType | Enum(TxType) | Yes | — | Source TX type |
| originalAmount | Decimal(12,2) | Yes | > 0 | Original AR amount |
| remainingAmount | Decimal(12,2) | Yes | ≥ 0 | Current outstanding balance |
| vatAmount | Decimal(12,2) | Yes | ≥ 0 | VAT portion |
| status | Enum(ApArStatus) | Yes | Default: OPEN | OPEN → PARTIAL → CLOSED |
| taxInvoiceNo | String | No | — | Tax invoice number (if issued) |
| dueDate | DateTime | No | — | Payment due date |
| period | String | Yes | YYYY-MM | Accounting period |
| createdAt | DateTime | Yes | Auto | Creation timestamp |
| updatedAt | DateTime | Yes | Auto | Last update timestamp |

**Relationships**:
- Has Many: `ARPaymentAllocation` via `arOpenItemId`

**Indexes**:
- Index: `customerId`
- Index: `status`
- Composite: `[customerId, status]` — for customer open items query
- Composite: `[status, dueDate]` — for aging report

**Business Rules**:
1. Same lifecycle rules as APOpenItem
2. Created by SALE_INVOICE or TEMP_DO (not INVOICE_FROM_DO — that's document-only)

---

### APPaymentAllocation

**Purpose**: Records individual payment allocations to AP open items (D3-3)

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | PK | Unique identifier |
| paymentTxId | UUID | Yes | FK → TxEntry (mock) | AP_PAYMENT TX reference |
| apOpenItemId | UUID | Yes | FK → APOpenItem | Target open item |
| amount | Decimal(12,2) | Yes | > 0 | Amount allocated to this item |
| createdAt | DateTime | Yes | Auto | Allocation timestamp |

**Relationships**:
- Belongs To: `APOpenItem` via `apOpenItemId`

**Indexes**:
- Index: `paymentTxId`
- Index: `apOpenItemId`

---

### ARPaymentAllocation

**Purpose**: Records individual payment allocations to AR open items (D3-3)

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | PK | Unique identifier |
| paymentTxId | UUID | Yes | FK → TxEntry (mock) | AR_RECEIVE TX reference |
| arOpenItemId | UUID | Yes | FK → AROpenItem | Target open item |
| amount | Decimal(12,2) | Yes | > 0 | Amount allocated to this item |
| createdAt | DateTime | Yes | Auto | Allocation timestamp |

**Relationships**:
- Belongs To: `AROpenItem` via `arOpenItemId`

**Indexes**:
- Index: `paymentTxId`
- Index: `arOpenItemId`

---

### GrIrClearing

**Purpose**: GR/IR Return Clearing account — tracks goods returned pending CN settlement (D3-5)

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| id | UUID | Yes | PK | Unique identifier |
| grReturnTxId | UUID | Yes | FK → TxEntry (mock) | GR_RETURN TX that opened this clearing |
| grReceiveTxId | UUID | Yes | FK → TxEntry (mock) | Original GR_RECEIVE reference |
| vendorId | UUID | Yes | FK (mock) | Supplier reference |
| itemId | UUID | Yes | FK (mock) | Item reference |
| qty | Decimal(12,4) | Yes | > 0 | Quantity returned |
| clearingAmount | Decimal(12,2) | Yes | > 0 | qty × MA at time of return |
| status | Enum(ClearingStatus) | Yes | Default: OPEN | OPEN → CLOSED |
| closedByTxId | UUID | No | FK → TxEntry (mock) | CN_RETURN or GR_REPLACEMENT TX that closed |
| closedByType | Enum(TxType) | No | — | CN_RETURN or GR_REPLACEMENT |
| ppvAmount | Decimal(12,2) | No | — | PPV calculated on close (CN_RETURN only) |
| createdAt | DateTime | Yes | Auto | Creation timestamp |
| closedAt | DateTime | No | — | When clearing was closed |

**Indexes**:
- Index: `vendorId`
- Index: `status`
- Composite: `[vendorId, status]` — for open clearings per vendor
- Index: `grReturnTxId` — lookup by return TX

**Business Rules**:
1. Created when GR_RETURN is POSTed: `clearingAmount = qty × ma_before`
2. Closed by CN_RETURN: `ppvAmount = clearingAmount - (unit_cost × qty)`
3. Closed by GR_REPLACEMENT: `ppvAmount = 0` (stock received at clearing value)
4. Cannot close already-closed clearing

---

## Enums

```typescript
// Local to transactions unit
enum JOStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

enum ClearingStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

// From shared-types (imported)
// TxType, TxStatus, ApArStatus, VatType — defined in libs/shared-types/
```

---

## Entity Relationship Diagram

```
┌─────────────────┐
│    JobOrder     │
├─────────────────┤
│ PK: id          │
│     joNumber    │
│     customerId  │──────────────── (mock: Customer)
│     status      │
│     hasTempDo   │
│ FK: tempDoId    │──┐
│ FK: invoiceId   │──┤
└─────────────────┘  │
                     │  (references to TxEntry in master_data — mocked)
                     │
┌─────────────────┐  │
│  APOpenItem     │  │
├─────────────────┤  │
│ PK: id          │  │
│ FK: txId        │──┘── (mock: TxEntry)
│     vendorId    │──────── (mock: Vendor)
│     status      │
│     remaining   │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────────┐
│ APPaymentAllocation │
├─────────────────────┤
│ PK: id              │
│ FK: apOpenItemId    │
│ FK: paymentTxId     │── (mock: TxEntry)
│     amount          │
└─────────────────────┘

┌─────────────────┐
│  AROpenItem     │
├─────────────────┤
│ PK: id          │
│ FK: txId        │──── (mock: TxEntry)
│     customerId  │──── (mock: Customer)
│     status      │
│     remaining   │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────────┐
│ ARPaymentAllocation │
├─────────────────────┤
│ PK: id              │
│ FK: arOpenItemId    │
│ FK: paymentTxId     │── (mock: TxEntry)
│     amount          │
└─────────────────────┘

┌─────────────────┐
│  GrIrClearing   │
├─────────────────┤
│ PK: id          │
│ FK: grReturnTxId│── (mock: TxEntry)
│ FK: grReceiveTxId│── (mock: TxEntry)
│     vendorId    │── (mock: Vendor)
│     itemId      │── (mock: Item)
│     status      │
│     clearing    │
│     ppvAmount   │
└─────────────────┘
```

---

## Data Access Patterns

| Query | Frequency | Index Used |
|-------|-----------|------------|
| List JOs by status + date | High | `[status, createdAt]` |
| Get JO by ID | High | PK |
| List open AP items by vendor | High | `[vendorId, status]` |
| List open AR items by customer | High | `[customerId, status]` |
| AP/AR aging (by status + dueDate) | Medium | `[status, dueDate]` |
| Get open clearings by vendor | Medium | `[vendorId, status]` |
| Payment allocations by TX | Medium | `paymentTxId` |
| Lookup clearing by GR_RETURN TX | Low | `grReturnTxId` |

---

## Prisma Schema (transactions schema)

```prisma
// Added to prisma/schema.prisma

model JobOrder {
  id          String    @id @default(uuid())
  joNumber    String    @unique
  customerId  String
  status      JOStatus  @default(OPEN)
  hasTempDo   Boolean   @default(false)
  tempDoId    String?
  invoiceId   String?
  items       Json
  totalAmount Decimal   @db.Decimal(12, 2)
  vatAmount   Decimal   @db.Decimal(12, 2)
  grandTotal  Decimal   @db.Decimal(12, 2)
  notes       String?
  createdBy   String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@schema("transactions")
  @@index([customerId])
  @@index([status, createdAt])
  @@map("job_order")
}

model APOpenItem {
  id              String       @id @default(uuid())
  vendorId        String
  txId            String
  txType          String
  originalAmount  Decimal      @db.Decimal(12, 2)
  remainingAmount Decimal      @db.Decimal(12, 2)
  vatAmount       Decimal      @db.Decimal(12, 2)
  status          ApArStatus   @default(OPEN)
  taxInvoiceNo    String
  dueDate         DateTime?
  period          String
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  allocations     APPaymentAllocation[]

  @@schema("transactions")
  @@index([vendorId, status])
  @@index([status, dueDate])
  @@map("ap_open_item")
}

model AROpenItem {
  id              String       @id @default(uuid())
  customerId      String
  txId            String
  txType          String
  originalAmount  Decimal      @db.Decimal(12, 2)
  remainingAmount Decimal      @db.Decimal(12, 2)
  vatAmount       Decimal      @db.Decimal(12, 2)
  status          ApArStatus   @default(OPEN)
  taxInvoiceNo    String?
  dueDate         DateTime?
  period          String
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  allocations     ARPaymentAllocation[]

  @@schema("transactions")
  @@index([customerId, status])
  @@index([status, dueDate])
  @@map("ar_open_item")
}

model APPaymentAllocation {
  id           String     @id @default(uuid())
  paymentTxId  String
  apOpenItemId String
  amount       Decimal    @db.Decimal(12, 2)
  createdAt    DateTime   @default(now())
  apOpenItem   APOpenItem @relation(fields: [apOpenItemId], references: [id])

  @@schema("transactions")
  @@index([paymentTxId])
  @@index([apOpenItemId])
  @@map("ap_payment_allocation")
}

model ARPaymentAllocation {
  id           String     @id @default(uuid())
  paymentTxId  String
  arOpenItemId String
  amount       Decimal    @db.Decimal(12, 2)
  createdAt    DateTime   @default(now())
  arOpenItem   AROpenItem @relation(fields: [arOpenItemId], references: [id])

  @@schema("transactions")
  @@index([paymentTxId])
  @@index([arOpenItemId])
  @@map("ar_payment_allocation")
}

model GrIrClearing {
  id             String         @id @default(uuid())
  grReturnTxId   String
  grReceiveTxId  String
  vendorId       String
  itemId         String
  qty            Decimal        @db.Decimal(12, 4)
  clearingAmount Decimal        @db.Decimal(12, 2)
  status         ClearingStatus @default(OPEN)
  closedByTxId   String?
  closedByType   String?
  ppvAmount      Decimal?       @db.Decimal(12, 2)
  createdAt      DateTime       @default(now())
  closedAt       DateTime?

  @@schema("transactions")
  @@index([vendorId, status])
  @@index([grReturnTxId])
  @@map("gr_ir_clearing")
}

enum JOStatus {
  OPEN
  IN_PROGRESS
  DONE

  @@schema("transactions")
}

enum ApArStatus {
  OPEN
  PARTIAL
  CLOSED

  @@schema("transactions")
}

enum ClearingStatus {
  OPEN
  CLOSED

  @@schema("transactions")
}
```
