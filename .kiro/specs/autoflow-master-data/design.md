# Design: master-data (ข้อมูลหลัก — Master Data & Core Engine)

## Summary
- **Architecture**: Modular Monolith — NestJS module exporting core services (TX Engine, MA, Stock, Period, VOID, Approval, Ref Chain)
- **Stack**: Angular (Signals + Material) / NestJS / PostgreSQL (Prisma) / fast-check (PBT)
- **Components**: 9 — TxLogService, MaCalculationService, StockValidationService, PeriodService, VoidService, ApprovalService, RefChainValidator, MasterDataCrudService, MasterDataUIModule
- **Entities**: 10 — TxLog, StockBalance, Period, Item, Warehouse, Vendor, Customer, User, Role, UserRole
- **Endpoints**: 28 — TX Engine (5), Master Data CRUD (20), Period (3)
- **Scope Note**: Self-contained unit — downstream dependencies (Transactions, Warehouse, Reports) will connect via mock interfaces until integration tasks

## Architecture

**Pattern**: Modular Monolith — this unit is a NestJS module (`MasterDataModule`) that exports core services for other units to consume via direct import.

```
┌─────────────────────────────────────────────────────────────────┐
│  Angular App (apps/web)                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Master Data UI Module (lazy-loaded)                      │    │
│  │  • Item CRUD   • Warehouse CRUD  • Vendor/Customer CRUD │    │
│  │  • User/Role   • Period Mgmt     • TX Log Viewer        │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────┘
                              │ HTTP/REST
┌─────────────────────────────┼───────────────────────────────────┐
│  NestJS API (apps/api)      │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐    │
│  │ MasterDataModule (libs/master-data/feature)              │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐   │    │
│  │  │ TxLogService │  │ MaCalcSvc   │  │ StockValidSvc │   │    │
│  │  └─────────────┘  └─────────────┘  └───────────────┘   │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐   │    │
│  │  │ PeriodSvc   │  │ VoidService │  │ ApprovalSvc   │   │    │
│  │  └─────────────┘  └─────────────┘  └───────────────┘   │    │
│  │  ┌─────────────┐  ┌─────────────┐                       │    │
│  │  │ RefChainVal │  │ CrudService │                       │    │
│  │  └─────────────┘  └─────────────┘                       │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐    │
│  │ MasterDataDataAccessModule (libs/master-data/data-access)│    │
│  │  • PrismaService (shared-prisma)                         │    │
│  │  • TxLogRepository                                       │    │
│  │  • StockBalanceRepository                                │    │
│  │  • ItemRepository, WarehouseRepository, etc.             │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│  PostgreSQL — schema: master_data                                 │
│  Tables: tx_log, stock_balance, period, item, warehouse,         │
│          vendor, customer, user, role, user_role                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. TxLogService
- **Purpose**: Create immutable TX Log entries, enforce immutability post-POST
- **Technology**: NestJS Injectable service + Prisma
- **Responsibilities**: 
  - Create TX entry with all mandatory fields populated
  - Set status to POSTED (after all validations pass)
  - Reject any UPDATE/DELETE on POSTED entries
  - Coordinate validation pipeline: Period → Stock → RefChain → MA → POST
- **Exposes**: `ITxLogService` interface (createTx, getTx, queryTxLog)
- **Consumes**: StockValidationService, MaCalculationService, PeriodService, RefChainValidator, ApprovalService

### 2. MaCalculationService
- **Purpose**: Calculate Moving Average atomically for stock-affecting transactions
- **Technology**: NestJS service + Prisma raw queries (FOR UPDATE lock)
- **Responsibilities**:
  - Acquire row lock on stock_balance for item+warehouse
  - Calculate new MA: `(existing_total_value + new_value) / (existing_qty + new_qty)` for increases
  - Use current MA (unchanged) for decreases
  - Record ma_before and ma_after in TX entry
  - Never recalculate retroactively
- **Exposes**: `IMaCalculationService` interface (calculateNewMa, getCurrentMa)
- **Consumes**: StockBalanceRepository (via Prisma with FOR UPDATE)

### 3. StockValidationService
- **Purpose**: Prevent negative stock on any transaction
- **Technology**: NestJS service + Prisma
- **Responsibilities**:
  - Check `stock_before - qty >= 0` before POST
  - Throw `StockNegativeException` with item, warehouse, stock, qty details
  - Validate within same DB transaction as POST (atomicity)
- **Exposes**: `IStockValidationService` interface (validateStockAvailable, getStockBalance)
- **Consumes**: StockBalanceRepository

### 4. PeriodService
- **Purpose**: Manage accounting periods and enforce period lock
- **Technology**: NestJS service + Prisma
- **Responsibilities**:
  - CRUD for periods (CFO opens/closes)
  - Validate period is OPEN before any POST
  - Throw `PeriodLockedException` for closed periods
- **Exposes**: `IPeriodService` interface (validatePeriodOpen, openPeriod, closePeriod, listPeriods)
- **Consumes**: PeriodRepository

### 5. VoidService
- **Purpose**: VOID a POSTed transaction by creating a reverse entry
- **Technology**: NestJS service + Prisma transaction
- **Responsibilities**:
  - Validate: original TX is POSTED, reason provided, user has Manager+ role
  - Create reverse TX (negated values) in single DB transaction
  - Update original TX status to VOIDED, set parent_tx_id on reverse
  - Trigger MA recalculation for reverse stock movement
- **Exposes**: `IVoidService` interface (voidTransaction)
- **Consumes**: TxLogService, MaCalculationService, StockValidationService

### 6. ApprovalService
- **Purpose**: Enforce role-based approval (DRAFT → POSTED)
- **Technology**: NestJS Guard + custom decorator `@RequiresApproval(Role)`
- **Responsibilities**:
  - Check user role against required approval level
  - Allow DRAFT creation by anyone, POST only by authorized role
  - Record `approved_by` and timestamp
  - Throw `InsufficientRoleException` on unauthorized attempts
- **Exposes**: `ApprovalGuard`, `@RequiresApproval()` decorator, `ApprovalService` (approveTx)
- **Consumes**: AuthContext (from shared-auth)

### 7. RefChainValidator
- **Purpose**: Validate reference chain integrity before POST
- **Technology**: NestJS service with rule registry pattern
- **Responsibilities**:
  - Registry of validation rules per TX type (e.g., CN → must reference Invoice)
  - Validate all ref_* fields against existing POSTED transactions
  - Throw `RefChainInvalidException` with specific rule violation
  - Extensible: other units register their rules when imported
- **Exposes**: `IRefChainService` interface (validateRefChain, registerRule)
- **Consumes**: TxLogRepository (to look up referenced TXs)

### 8. MasterDataCrudService
- **Purpose**: CRUD operations for all master data entities
- **Technology**: NestJS controllers + services per entity
- **Responsibilities**:
  - Item: CRUD with code, name, unit, category, active status
  - Warehouse: CRUD with code, name, location, active status
  - Vendor: CRUD with code, name, tax_id, contact info
  - Customer: CRUD with code, name, tax_id, contact info
  - User: CRUD with username, roles assignment, active status
  - All: Pagination (offset-based), filtering, soft-delete (active flag)
- **Exposes**: REST endpoints per entity
- **Consumes**: Entity-specific Prisma repositories

### 9. MasterDataUIModule (Angular)
- **Purpose**: Angular lazy-loaded feature module for master data management
- **Technology**: Angular + Signals + Angular Material
- **Responsibilities**:
  - Data tables (AG Grid pattern) for items, warehouses, vendors, customers, users
  - Create/Edit forms with validation
  - Period management panel (open/close)
  - TX Log viewer (read-only, filter by type/date/item)
- **Exposes**: Route: `/master-data/**`
- **Consumes**: NestJS REST API (via Angular HttpClient + Signals)

---

## Data Model

### tx_log
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | TX unique identifier |
| tx_type | VARCHAR(30) | NOT NULL, enum check | TxType enum value |
| tx_status | VARCHAR(10) | NOT NULL, default 'DRAFT' | DRAFT / POSTED / VOIDED |
| tx_date | TIMESTAMP | NOT NULL | Business date of transaction |
| period | VARCHAR(7) | NOT NULL | Accounting period YYYY-MM |
| item_id | UUID | FK → item, nullable | Related item (null for non-stock TX) |
| warehouse_id | UUID | FK → warehouse, nullable | Related warehouse |
| qty | DECIMAL(12,4) | nullable | Quantity (positive=increase, negative=decrease) |
| unit_cost | DECIMAL(12,2) | nullable | Cost per unit |
| total_cost | DECIMAL(14,2) | nullable | qty × unit_cost |
| ma_before | DECIMAL(12,2) | nullable | MA before this TX |
| ma_after | DECIMAL(12,2) | nullable | MA after this TX |
| stock_before | DECIMAL(12,4) | nullable | Stock qty before this TX |
| stock_after | DECIMAL(12,4) | nullable | Stock qty after this TX |
| vendor_id | UUID | FK → vendor, nullable | Related vendor |
| customer_id | UUID | FK → customer, nullable | Related customer |
| ref_jo_id | UUID | FK → tx_log, nullable | Reference to Job Order |
| ref_do_id | UUID | FK → tx_log, nullable | Reference to TEMP_DO |
| ref_invoice_id | UUID | FK → tx_log, nullable | Reference to Invoice |
| ref_gr_id | UUID | FK → tx_log, nullable | Reference to GR_RECEIVE |
| ref_cn_id | UUID | FK → tx_log, nullable | Reference to CN |
| parent_tx_id | UUID | FK → tx_log, nullable | VOID: reference to original TX |
| tax_invoice_no | VARCHAR(50) | nullable | Tax invoice number |
| base_amount | DECIMAL(14,2) | nullable | Amount before VAT |
| vat_amount | DECIMAL(14,2) | nullable | VAT amount |
| vat_type | VARCHAR(10) | nullable | INPUT / OUTPUT / NONE |
| ar_amount | DECIMAL(14,2) | nullable | AR Open Item amount |
| ap_amount | DECIMAL(14,2) | nullable | AP Open Item amount |
| ap_ar_status | VARCHAR(10) | nullable | OPEN / PARTIAL / CLOSED |
| cogs_unit | DECIMAL(12,2) | nullable | COGS per unit at time of sale |
| reason | TEXT | nullable | Reason (for VOID, CN) |
| approved_by | UUID | FK → user, nullable | Who approved |
| approved_at | TIMESTAMP | nullable | When approved |
| created_by | UUID | FK → user, NOT NULL | Creator user |
| created_at | TIMESTAMP | NOT NULL, default now() | Creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, default now() | Last update (only for DRAFT→POSTED/VOIDED) |

**Indexes**:
- `idx_tx_log_type_period` — (tx_type, period) for filtered queries
- `idx_tx_log_item_warehouse` — (item_id, warehouse_id) for stock queries
- `idx_tx_log_status` — (tx_status) for approval dashboard
- `idx_tx_log_customer` — (customer_id) for AR queries
- `idx_tx_log_vendor` — (vendor_id) for AP queries
- `idx_tx_log_parent` — (parent_tx_id) for VOID lookup

---

### stock_balance
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Balance record ID |
| item_id | UUID | FK → item, NOT NULL | Item |
| warehouse_id | UUID | FK → warehouse, NOT NULL | Warehouse |
| qty | DECIMAL(12,4) | NOT NULL, default 0 | Current stock quantity |
| total_value | DECIMAL(14,2) | NOT NULL, default 0 | Current total inventory value |
| ma | DECIMAL(12,2) | NOT NULL, default 0 | Current Moving Average |
| is_frozen | BOOLEAN | NOT NULL, default false | Frozen for stock count |
| last_tx_id | UUID | FK → tx_log, nullable | Last TX that updated this balance |
| updated_at | TIMESTAMP | NOT NULL | Last update timestamp |

**Unique constraint**: `(item_id, warehouse_id)` — one balance per item+warehouse pair
**Indexes**:
- `idx_stock_balance_item_wh` UNIQUE — (item_id, warehouse_id)
- `idx_stock_balance_frozen` — (is_frozen) WHERE is_frozen = true

---

### period
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Period ID |
| period | VARCHAR(7) | UNIQUE, NOT NULL | Period identifier YYYY-MM |
| status | VARCHAR(10) | NOT NULL, default 'OPEN' | OPEN / CLOSED |
| opened_by | UUID | FK → user | Who opened |
| opened_at | TIMESTAMP | NOT NULL | When opened |
| closed_by | UUID | FK → user, nullable | Who closed |
| closed_at | TIMESTAMP | nullable | When closed |

---

### item
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Item ID |
| code | VARCHAR(20) | UNIQUE, NOT NULL | Item code |
| name | VARCHAR(200) | NOT NULL | Item name |
| unit | VARCHAR(20) | NOT NULL | Unit of measure |
| category | VARCHAR(50) | nullable | Item category |
| is_active | BOOLEAN | NOT NULL, default true | Soft-delete flag |
| created_at | TIMESTAMP | NOT NULL | Creation time |
| updated_at | TIMESTAMP | NOT NULL | Last update |

---

### warehouse
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Warehouse ID |
| code | VARCHAR(20) | UNIQUE, NOT NULL | Warehouse code |
| name | VARCHAR(200) | NOT NULL | Warehouse name |
| location | VARCHAR(300) | nullable | Physical location |
| is_active | BOOLEAN | NOT NULL, default true | Soft-delete flag |
| created_at | TIMESTAMP | NOT NULL | Creation time |
| updated_at | TIMESTAMP | NOT NULL | Last update |

---

### vendor
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Vendor ID |
| code | VARCHAR(20) | UNIQUE, NOT NULL | Vendor code |
| name | VARCHAR(200) | NOT NULL | Vendor name |
| tax_id | VARCHAR(20) | nullable | Tax ID |
| address | TEXT | nullable | Address |
| phone | VARCHAR(20) | nullable | Phone |
| email | VARCHAR(100) | nullable | Email |
| is_active | BOOLEAN | NOT NULL, default true | Soft-delete flag |
| created_at | TIMESTAMP | NOT NULL | Creation time |
| updated_at | TIMESTAMP | NOT NULL | Last update |

---

### customer
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Customer ID |
| code | VARCHAR(20) | UNIQUE, NOT NULL | Customer code |
| name | VARCHAR(200) | NOT NULL | Customer name |
| tax_id | VARCHAR(20) | nullable | Tax ID |
| address | TEXT | nullable | Address |
| phone | VARCHAR(20) | nullable | Phone |
| email | VARCHAR(100) | nullable | Email |
| is_active | BOOLEAN | NOT NULL, default true | Soft-delete flag |
| created_at | TIMESTAMP | NOT NULL | Creation time |
| updated_at | TIMESTAMP | NOT NULL | Last update |

---

### user
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | User ID |
| username | VARCHAR(50) | UNIQUE, NOT NULL | Login username |
| password_hash | VARCHAR(255) | NOT NULL | Hashed password (bcrypt) |
| full_name | VARCHAR(200) | NOT NULL | Display name |
| email | VARCHAR(100) | nullable | Email |
| is_active | BOOLEAN | NOT NULL, default true | Account active |
| created_at | TIMESTAMP | NOT NULL | Creation time |
| updated_at | TIMESTAMP | NOT NULL | Last update |

---

### role
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Role ID |
| name | VARCHAR(20) | UNIQUE, NOT NULL | CASHIER, STORE, SUPERVISOR, MANAGER, CFO, ADMIN |
| description | VARCHAR(200) | nullable | Role description |

---

### user_role
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Assignment ID |
| user_id | UUID | FK → user, NOT NULL | User |
| role_id | UUID | FK → role, NOT NULL | Role |
| assigned_at | TIMESTAMP | NOT NULL | When assigned |

**Unique constraint**: `(user_id, role_id)`

---

**Relationships**:
- tx_log → item (many-to-one, nullable)
- tx_log → warehouse (many-to-one, nullable)
- tx_log → vendor (many-to-one, nullable)
- tx_log → customer (many-to-one, nullable)
- tx_log → user (many-to-one, created_by)
- tx_log → tx_log (self-reference: parent_tx_id, ref_* fields)
- stock_balance → item + warehouse (unique pair)
- user_role → user + role (many-to-many bridge)

---

## API Specification

**Base URL**: `/api/v1`
**Auth**: JWT Bearer token (all endpoints require authentication)
**Pagination**: Offset-based `?page=1&pageSize=20`
**Response envelope**: NestJS default (no custom wrapper)
**Error format**: `{ statusCode, message, error }` or DomainException `{ code, message, details }`

### TX Engine Endpoints

#### POST /api/v1/tx
- **Description**: Create and POST a new transaction (runs full validation pipeline)
- **Auth**: Role depends on TX type (Cashier for sales, Store for GR, Manager for CN/VOID)
- **Request**: 
```json
{
  "txType": "GR_RECEIVE",
  "txDate": "2025-01-20T00:00:00Z",
  "period": "2025-01",
  "itemId": "uuid",
  "warehouseId": "uuid",
  "qty": 100,
  "unitCost": 50.00,
  "vendorId": "uuid",
  "taxInvoiceNo": "INV-001",
  "baseAmount": 5000.00,
  "vatAmount": 350.00,
  "vatType": "INPUT"
}
```
- **Response 201**: Full TxLog entry with calculated fields (ma_before, ma_after, stock_before, stock_after, ap_amount)
- **Errors**: 400 (validation), 403 (role/period/immutable), 422 (stock negative)

#### POST /api/v1/tx/:id/approve
- **Description**: Approve a DRAFT transaction (change to POSTED)
- **Auth**: Role required by TX type (Manager, CFO, etc.)
- **Request**: `{}` (empty — approval is the action)
- **Response 200**: Updated TxLog entry with status=POSTED, approved_by, approved_at
- **Errors**: 403 (insufficient role), 404 (TX not found), 409 (not DRAFT)

#### POST /api/v1/tx/:id/void
- **Description**: VOID a POSTED transaction
- **Auth**: Manager+
- **Request**: `{ "reason": "string" }`
- **Response 201**: New reverse TxLog entry (VOID type)
- **Errors**: 400 (no reason), 403 (insufficient role), 404, 409 (not POSTED)

#### GET /api/v1/tx
- **Description**: Query TX Log with pagination and filters
- **Auth**: Any authenticated user
- **Query params**: `page, pageSize, txType, txStatus, period, itemId, warehouseId, dateFrom, dateTo`
- **Response 200**: 
```json
{
  "data": [TxLog[]],
  "pagination": { "page": 1, "pageSize": 20, "total": 150, "totalPages": 8 }
}
```

#### GET /api/v1/tx/:id
- **Description**: Get single TX entry
- **Auth**: Any authenticated user
- **Response 200**: Single TxLog entry
- **Errors**: 404

### Master Data CRUD Endpoints

#### Items: /api/v1/items
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/items | List with pagination + filter | Any |
| GET | /api/v1/items/:id | Get by ID | Any |
| POST | /api/v1/items | Create item | Admin |
| PATCH | /api/v1/items/:id | Update item | Admin |
| DELETE | /api/v1/items/:id | Soft-delete (set is_active=false) | Admin |

#### Warehouses: /api/v1/warehouses
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/warehouses | List | Any |
| GET | /api/v1/warehouses/:id | Get by ID | Any |
| POST | /api/v1/warehouses | Create | Admin |
| PATCH | /api/v1/warehouses/:id | Update | Admin |
| DELETE | /api/v1/warehouses/:id | Soft-delete | Admin |

#### Vendors: /api/v1/vendors
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/vendors | List | Any |
| GET | /api/v1/vendors/:id | Get by ID | Any |
| POST | /api/v1/vendors | Create | Admin |
| PATCH | /api/v1/vendors/:id | Update | Admin |
| DELETE | /api/v1/vendors/:id | Soft-delete | Admin |

#### Customers: /api/v1/customers
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/customers | List | Any |
| GET | /api/v1/customers/:id | Get by ID | Any |
| POST | /api/v1/customers | Create | Admin |
| PATCH | /api/v1/customers/:id | Update | Admin |
| DELETE | /api/v1/customers/:id | Soft-delete | Admin |

#### Users: /api/v1/users
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/v1/users | List | Admin |
| GET | /api/v1/users/:id | Get by ID | Admin |
| POST | /api/v1/users | Create user | Admin |
| PATCH | /api/v1/users/:id | Update user | Admin |
| POST | /api/v1/users/:id/roles | Assign roles | Admin |
| DELETE | /api/v1/users/:id/roles/:roleId | Remove role | Admin |

### Period Endpoints

#### GET /api/v1/periods
- **Description**: List all periods with status
- **Auth**: Manager+

#### POST /api/v1/periods
- **Description**: Open new period
- **Auth**: CFO
- **Request**: `{ "period": "2025-02" }`
- **Response 201**: Period entry

#### PATCH /api/v1/periods/:id/close
- **Description**: Close period
- **Auth**: CFO
- **Response 200**: Updated period with closed status

### Stock Balance Endpoints

#### GET /api/v1/stock-balance
- **Description**: Query stock balances with filters
- **Auth**: Any authenticated
- **Query params**: `itemId, warehouseId, page, pageSize`
- **Response 200**: StockBalance entries with current qty + MA

#### GET /api/v1/stock-balance/:itemId/:warehouseId
- **Description**: Get specific stock balance for item+warehouse
- **Auth**: Any authenticated
- **Response 200**: Single StockBalance entry

---

## Integration Points

| External System | Protocol | Purpose | Error Handling |
|----------------|----------|---------|----------------|
| Downstream units (Transactions, Warehouse, Reports) | Direct NestJS module import | Export TX Engine services | N/A — in-process |
| Mock API (for dev) | JSON fixtures | Simulate downstream calls during standalone development | Return mock responses |

**Note**: This unit has NO upstream dependencies. It is the foundation all others depend on. During development, services are self-contained. Mock data (items, warehouses, vendors, customers) is provided via seed scripts.

---

## Implementation

### Directory Structure
```
libs/master-data/
├── data-access/
│   └── src/
│       ├── lib/
│       │   ├── repositories/
│       │   │   ├── tx-log.repository.ts
│       │   │   ├── stock-balance.repository.ts
│       │   │   ├── period.repository.ts
│       │   │   ├── item.repository.ts
│       │   │   ├── warehouse.repository.ts
│       │   │   ├── vendor.repository.ts
│       │   │   ├── customer.repository.ts
│       │   │   └── user.repository.ts
│       │   └── master-data-data-access.module.ts
│       └── index.ts
├── feature/
│   └── src/
│       ├── lib/
│       │   ├── services/
│       │   │   ├── tx-log.service.ts
│       │   │   ├── ma-calculation.service.ts
│       │   │   ├── stock-validation.service.ts
│       │   │   ├── period.service.ts
│       │   │   ├── void.service.ts
│       │   │   ├── approval.service.ts
│       │   │   ├── ref-chain-validator.service.ts
│       │   │   ├── item.service.ts
│       │   │   ├── warehouse.service.ts
│       │   │   ├── vendor.service.ts
│       │   │   ├── customer.service.ts
│       │   │   └── user.service.ts
│       │   ├── controllers/
│       │   │   ├── tx.controller.ts
│       │   │   ├── item.controller.ts
│       │   │   ├── warehouse.controller.ts
│       │   │   ├── vendor.controller.ts
│       │   │   ├── customer.controller.ts
│       │   │   ├── user.controller.ts
│       │   │   ├── period.controller.ts
│       │   │   └── stock-balance.controller.ts
│       │   ├── guards/
│       │   │   └── approval.guard.ts
│       │   ├── decorators/
│       │   │   └── requires-approval.decorator.ts
│       │   ├── dto/
│       │   │   ├── create-tx.dto.ts
│       │   │   ├── void-tx.dto.ts
│       │   │   ├── create-item.dto.ts
│       │   │   ├── update-item.dto.ts
│       │   │   ├── ... (other entity DTOs)
│       │   │   └── query-params.dto.ts
│       │   └── master-data.module.ts
│       └── index.ts
└── ui/
    └── src/
        ├── lib/
        │   ├── pages/
        │   │   ├── item-list/
        │   │   ├── item-form/
        │   │   ├── warehouse-list/
        │   │   ├── vendor-list/
        │   │   ├── customer-list/
        │   │   ├── user-list/
        │   │   ├── period-management/
        │   │   └── tx-log-viewer/
        │   ├── services/
        │   │   ├── item-api.service.ts
        │   │   ├── warehouse-api.service.ts
        │   │   ├── vendor-api.service.ts
        │   │   ├── customer-api.service.ts
        │   │   ├── user-api.service.ts
        │   │   ├── period-api.service.ts
        │   │   ├── tx-api.service.ts
        │   │   └── stock-balance-api.service.ts
        │   ├── master-data.routes.ts
        │   └── master-data-ui.module.ts
        └── index.ts
```

### Dev Setup
```bash
# From workspace root (monorepo)
npm install
npx prisma generate
npx prisma migrate dev
docker-compose up -d   # PostgreSQL
nx serve api           # NestJS dev server
nx serve web           # Angular dev server
```

### Conventions
- **Files**: kebab-case (`tx-log.service.ts`)
- **Code**: Layered (Controller → Service → Repository → Prisma)
- **Tests**: Jest (`nx test master-data-feature`), Supertest for integration
- **Validation**: class-validator decorators in DTOs
- **Documentation**: OpenAPI via @nestjs/swagger decorators

---

## Correctness Properties

| Property | Description | Validates |
|----------|-------------|-----------|
| P1: MA Arithmetic Invariant | For any stock-increasing TX: new_ma = (old_total_value + incoming_value) / (old_qty + incoming_qty). For stock-decreasing: MA unchanged. | US-002 |
| P2: Stock Non-Negative | For any sequence of TXs on same item+warehouse, stock_balance.qty >= 0 always holds. | US-003 |
| P3: TX Immutability | After a TX enters POSTED status, its qty, unit_cost, total_cost, ma_before, ma_after fields never change. | US-001 |
| P4: Period Lock | No TX with period=X can be POSTed after period X status is CLOSED. | US-004 |
| P5: VOID Balance | After VOIDing a TX, the net effect on stock_balance equals zero (original + void = 0). | US-005 |
| P6: Reference Chain Completeness | Every TX with non-null ref_* fields has a corresponding POSTED TX for that reference. | US-006 |
| P7: Approval Authority | A TX requiring approval can only transition DRAFT→POSTED if approved_by has the required role. | US-007 |
| P8: MA Consistency | stock_balance.ma * stock_balance.qty == stock_balance.total_value (within rounding tolerance). | US-002 |

**Testing approach**: fast-check generates random TX sequences (varying types, quantities, costs). Properties are checked after each sequence completes. Shrinking finds minimal failing cases.

---

## Traceability

| Requirement | Component | API | Data |
|-------------|-----------|-----|------|
| US-001 | TxLogService | POST /tx, GET /tx | tx_log |
| US-002 | MaCalculationService | POST /tx (internal) | stock_balance (ma, total_value) |
| US-003 | StockValidationService | POST /tx (internal) | stock_balance (qty) |
| US-004 | PeriodService | POST /tx (internal), GET/POST/PATCH /periods | period |
| US-005 | VoidService | POST /tx/:id/void | tx_log (parent_tx_id), stock_balance |
| US-006 | RefChainValidator | POST /tx (internal) | tx_log (ref_* fields) |
| US-007 | ApprovalService, ApprovalGuard | POST /tx/:id/approve | tx_log (approved_by, tx_status) |
