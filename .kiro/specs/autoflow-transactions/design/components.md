# Components — Unit: transactions (ข้อมูลพื้นฐาน)

## Overview
Transaction Operations module จัดโครงสร้างแบบ Domain-based services ตาม D3-1 แบ่งเป็น 3 domain services หลัก (Sales, Purchasing, AP/AR) พร้อม Mock layer สำหรับ Master Data dependency ตาม D3-4

Architecture: NestJS module ใน Modular Monolith, ใช้ Prisma ORM กับ `transactions` schema, Angular lazy-loaded feature module สำหรับ frontend

---

## Backend Components

### SalesService

**Purpose**: จัดการ Sales flow ทั้งหมด — Job Order, TEMP_DO, Invoice (dual-path), Sales CN

**Technology**: NestJS service, Prisma, class-validator

**Responsibilities**:
- Job Order CRUD + state machine (OPEN → IN_PROGRESS → DONE)
- TEMP_DO creation จาก completed JO (Path A)
- INVOICE_FROM_DO creation จาก TEMP_DO (Path A)
- SALE_INVOICE creation จาก JO (Path B)
- CN_SALES_RETURN processing (stock return + AR reduction)
- CN_SALES_PRICE processing (AR reduction only)
- Automatic TX type determination จาก `has_temp_do` flag

**Exposes**:
- `createJobOrder(dto)` → JobOrder
- `updateJobOrderStatus(id, status)` → JobOrder
- `issueTempDO(joId, dto)` → TxEntry
- `issueInvoice(joId, dto)` → TxEntry (auto-determines INVOICE_FROM_DO or SALE_INVOICE)
- `createSalesReturn(dto)` → TxEntry
- `createSalesPriceAdj(dto)` → TxEntry

**Consumes**:
- `IMasterDataMockService` — TX Log creation, MA calculation, stock validation, period check
- `ApArService` — AR Open Item creation/update
- `PrismaService` — Database access (transactions schema)

**Internal Structure**:
```
sales/
├── sales.controller.ts        # REST endpoints
├── sales.service.ts           # Business logic orchestration
├── job-order.service.ts       # JO state machine + CRUD
├── invoice.service.ts         # Invoice path determination + creation
├── sales-cn.service.ts        # CN_SALES_RETURN + CN_SALES_PRICE
├── dto/                       # Request/Response DTOs
│   ├── create-job-order.dto.ts
│   ├── issue-temp-do.dto.ts
│   ├── issue-invoice.dto.ts
│   └── create-sales-cn.dto.ts
└── tests/
    ├── sales.service.spec.ts
    └── job-order.service.spec.ts
```

**Key Decisions**:
1. JO state machine: Simple enum + validation in service (D3-2)
2. TX type auto-determination: ระบบเลือก INVOICE_FROM_DO vs SALE_INVOICE จาก `has_temp_do`
3. CN condition handling: "good" → stock return + MA recalc, "damaged_total" → loss only

**Error Handling**:
- `JoNotDoneException` — JO status ≠ DONE เมื่อ issue TEMP_DO/Invoice
- `DuplicateTempDoException` — JO already has TEMP_DO
- `DuplicateInvoiceException` — JO already has invoice
- `ReturnQtyExceededException` — CN return qty > original sale qty

---

### PurchasingService

**Purpose**: จัดการ Purchasing flow ทั้งหมด — GR_RECEIVE, GR_RETURN, GR_REPLACEMENT, Purchase CN (3 types)

**Technology**: NestJS service, Prisma, class-validator

**Responsibilities**:
- GR_RECEIVE processing (stock + MA + AP creation)
- GR_RETURN processing (stock decrease + clearing account open)
- GR_REPLACEMENT processing (stock increase from clearing + clearing close)
- CN_RETURN processing (AP reduction + PPV + clearing close)
- CN_PRICE_ADJ processing (inventory + AP adjustment)
- AP_CN_DEBT processing (AP reduction only)
- GR/IR Clearing lifecycle management

**Exposes**:
- `createGoodsReceipt(dto)` → TxEntry
- `createGoodsReturn(dto)` → TxEntry
- `receiveReplacement(dto)` → TxEntry
- `createCnReturn(dto)` → TxEntry
- `createCnPriceAdj(dto)` → TxEntry
- `createCnDebt(dto)` → TxEntry

**Consumes**:
- `IMasterDataMockService` — TX Log, MA, stock validation, period check, ref chain validation
- `ApArService` — AP Open Item creation/update
- `GrIrClearingService` — Clearing account management
- `PrismaService` — Database access

**Internal Structure**:
```
purchasing/
├── purchasing.controller.ts     # REST endpoints
├── purchasing.service.ts        # Business logic orchestration
├── goods-receipt.service.ts     # GR_RECEIVE + GR_RETURN + GR_REPLACEMENT
├── purchase-cn.service.ts       # CN_RETURN + CN_PRICE_ADJ + AP_CN_DEBT
├── gr-ir-clearing.service.ts    # Clearing account lifecycle (D3-5)
├── dto/
│   ├── create-goods-receipt.dto.ts
│   ├── create-goods-return.dto.ts
│   ├── create-cn-return.dto.ts
│   └── create-cn-price-adj.dto.ts
└── tests/
    ├── purchasing.service.spec.ts
    └── gr-ir-clearing.service.spec.ts
```

**Key Decisions**:
1. GR/IR Clearing: Dedicated table `gr_ir_clearing` with status tracking (D3-5)
2. CN_RETURN: ห้ามแตะ inventory fields — enforce via validation
3. PPV calculation: GR/IR Clearing balance − AP reduction amount

**Error Handling**:
- `GrAlreadyReturnedException` — GR fully returned
- `CnReturnInventoryException` — CN_RETURN attempts inventory modification
- `ClearingNotOpenException` — Clearing already closed

---

### ApArService

**Purpose**: จัดการ AP/AR Open Item lifecycle — creation, payment matching, status transitions

**Technology**: NestJS service, Prisma

**Responsibilities**:
- AP Open Item creation (from GR_RECEIVE)
- AR Open Item creation (from SALE_INVOICE/TEMP_DO)
- AP Payment matching (manual allocation array — D3-3)
- AR Payment matching (manual allocation array — D3-3)
- Status lifecycle: OPEN → PARTIAL → CLOSED
- CN impact on open items (partial reduction)

**Exposes**:
- `createApOpenItem(txEntry)` → APItem
- `createArOpenItem(txEntry)` → ARItem
- `makeApPayment(dto)` → TxEntry
- `receiveArPayment(dto)` → TxEntry
- `reduceApByCn(openItemId, amount)` → APItem
- `reduceArByCn(openItemId, amount)` → ARItem
- `getOpenApItems(vendorId, filters)` → APItem[]
- `getOpenArItems(customerId, filters)` → ARItem[]

**Consumes**:
- `IMasterDataMockService` — TX Log creation, period check
- `PrismaService` — Database access

**Internal Structure**:
```
ap-ar/
├── ap-ar.controller.ts          # REST endpoints (AP + AR)
├── ap.service.ts                # AP-specific logic
├── ar.service.ts                # AR-specific logic
├── payment-matching.service.ts  # Shared matching logic (D3-3)
├── dto/
│   ├── make-ap-payment.dto.ts
│   ├── receive-ar-payment.dto.ts
│   └── payment-allocation.dto.ts
└── tests/
    ├── ap.service.spec.ts
    ├── ar.service.spec.ts
    └── payment-matching.service.spec.ts
```

**Key Decisions**:
1. Payment allocation array: User ส่ง `[{ openItemId, amount }]` (D3-3)
2. Status transitions: Automatic based on remaining balance
3. CN reduction: Separate from payment — different business logic

**Error Handling**:
- `PaymentExceedsBalanceException` — Payment > total open balance
- `OpenItemNotFoundException` — Referenced open item doesn't exist
- `OpenItemAlreadyClosedException` — Attempt to pay closed item

---

### IMasterDataMockService (Mock Layer)

**Purpose**: Mock implementation ของ Master Data services สำหรับ development แบบ standalone (D3-4)

**Technology**: NestJS injectable, implements shared interfaces

**Responsibilities**:
- Mock TX Log creation (return fake TxEntry with generated ID)
- Mock MA calculation (return configurable MA values)
- Mock stock validation (configurable stock levels)
- Mock period validation (configurable period status)
- Mock reference chain validation (configurable valid refs)
- Mock item/vendor/customer lookup

**Exposes**:
- Implements `ITxLogService`, `IMaCalculationService`, `IStockValidationService`, `IPeriodService`, `IRefChainService`

**Consumes**: None (self-contained mock)

**Internal Structure**:
```
mocks/
├── master-data-mock.module.ts     # NestJS module (swap with real MasterDataModule later)
├── mock-tx-log.service.ts         # ITxLogService mock
├── mock-ma-calculation.service.ts # IMaCalculationService mock
├── mock-stock-validation.service.ts
├── mock-period.service.ts
├── mock-ref-chain.service.ts
├── mock-data/                     # JSON fixtures for mock responses
│   ├── items.json
│   ├── vendors.json
│   ├── customers.json
│   └── warehouses.json
└── README.md                      # How to configure mocks + how to swap to real
```

**Key Decisions**:
1. DI-based swap: เปลี่ยนจาก mock → real โดย swap module import เท่านั้น
2. Configurable: Mock data อ่านจาก JSON fixtures, ปรับได้ตาม test scenario
3. Interface compliance: Mock ต้อง implement shared interface เหมือนกับ real service ทุกประการ

---

## Frontend Components

### TransactionsFeatureModule (Angular)

**Purpose**: Lazy-loaded Angular feature module สำหรับ transactions UI ทั้งหมด

**Technology**: Angular 17+, Signals (D3-7), Template-driven forms (D3-8)

**Responsibilities**:
- Job Order management UI (list, create, status update)
- Invoice issuance UI (auto-path determination)
- GR/CN forms
- AP/AR payment matching UI
- AP/AR open item list views

**Internal Structure**:
```
libs/transactions/ui/src/
├── transactions.routes.ts           # Lazy-loaded routes
├── pages/
│   ├── job-order/
│   │   ├── job-order-list.component.ts
│   │   ├── job-order-create.component.ts
│   │   └── job-order-detail.component.ts
│   ├── sales/
│   │   ├── invoice-create.component.ts
│   │   └── sales-cn-create.component.ts
│   ├── purchasing/
│   │   ├── gr-receive-create.component.ts
│   │   ├── gr-return-create.component.ts
│   │   └── purchase-cn-create.component.ts
│   └── ap-ar/
│       ├── ap-payment.component.ts
│       ├── ar-payment.component.ts
│       ├── ap-list.component.ts
│       └── ar-list.component.ts
├── components/                      # Shared UI components
│   ├── tx-form-base.component.ts    # Base form with common fields
│   ├── payment-allocation.component.ts
│   └── open-item-selector.component.ts
├── services/
│   ├── transactions-api.service.ts  # HTTP client
│   └── transactions-state.service.ts # Signal-based state (D3-7)
├── validators/                      # Custom template-driven validators (D3-8)
│   ├── ref-chain.validator.ts
│   ├── qty-positive.validator.ts
│   └── period-open.validator.ts
└── models/
    └── index.ts                     # Frontend-specific types
```

**Key Decisions**:
1. Signal-based state (D3-7): ใช้ Angular Signals + computed signals แทน NgRx
2. Template-driven forms (D3-8): ใช้ ngModel + custom validator directives
3. Lazy-loaded: โหลดเฉพาะเมื่อ navigate เข้า transactions routes

---

## Component Interactions

```
┌─────────────────────────────────────────────────────────────────┐
│                    Angular Frontend (UI)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Job Order   │  │  GR / CN     │  │  AP/AR       │          │
│  │  Pages       │  │  Pages       │  │  Pages       │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┼──────────────────┘                  │
│                            │ HTTP (REST)                          │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────┼─────────────────────────────────────┐
│                    NestJS Backend                                  │
│                            │                                      │
│  ┌──────────────┐  ┌──────┴───────┐  ┌──────────────┐          │
│  │ SalesService │  │ Purchasing   │  │  ApArService │          │
│  │              │  │ Service      │  │              │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┼──────────────────┘                  │
│                            │                                      │
│              ┌─────────────┼─────────────┐                       │
│              │  IMasterDataMockService    │  ← DI swap later     │
│              │  (Mock TX Log, MA, Stock)  │                       │
│              └─────────────┬─────────────┘                       │
│                            │                                      │
│              ┌─────────────┴─────────────┐                       │
│              │     Prisma (transactions   │                       │
│              │     schema)               │                       │
│              └───────────────────────────┘                       │
└───────────────────────────────────────────────────────────────────┘
```

**Data Flow**:
1. Frontend → REST API → Controller → Service → Mock/Prisma → Response
2. Sales/Purchasing services call `IMasterDataMockService` for TX Log, MA, Stock operations
3. Sales/Purchasing services call `ApArService` for AP/AR Open Item creation
4. `GrIrClearingService` manages clearing lifecycle (called by PurchasingService)
