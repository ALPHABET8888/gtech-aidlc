# Implementation Tasks — Unit: master-data (ข้อมูลหลัก)

## Overview
Tasks organized by **vertical slices** — each phase delivers a complete feature end-to-end (schema → service → controller → tests). Core engine slices built first (unblocks other teams), then Master Data CRUD, then Frontend UI last.

**Derived From**:
- Requirements: 7 user stories (US-001 to US-007) from `requirements.md`
- Design: 9 components, 10 entities, 28 endpoints from `design.md`

**Strategy**: Vertical Slice (D4-1)
**Rationale**: Each slice delivers testable, demoable functionality. Core engine first unblocks downstream teams. Incremental schema per slice.

---

- [x] 1. Project Scaffold & Shared Infra
  - [x] 1.1 Nx library scaffold for master-data unit
    - **Deps**: None | **Ref**: `design.md` — Implementation/Directory Structure
    - Generate `libs/master-data/data-access`, `libs/master-data/feature`, `libs/master-data/ui` libraries using Nx generators
    - Configure tsconfig paths, barrel exports (index.ts)
    - Register `MasterDataModule` in `apps/api/src/app.module.ts`
  - [x] 1.2 Prisma schema — base tables (period, item, warehouse, vendor, customer, user, role, user_role)
    - **Deps**: 1.1 | **Ref**: `design.md` — Data Model (period, item, warehouse, vendor, customer, user, role, user_role)
    - Add all 8 master data tables to `prisma/schema.prisma` under `@@schema("master_data")`
    - Add indexes, unique constraints, relationships per design
    - Run `npx prisma migrate dev --name master-data-base-tables`
  - [x] 1.3 Seed data script for development
    - **Deps**: 1.2 | **Ref**: `foundation.md` — Infrastructure Units
    - Create `prisma/seed-master-data.ts` with sample items (10), warehouses (3), vendors (5), customers (5), users (6 — one per role), roles (6), periods (3 — 2 open, 1 closed)
    - Add to `prisma/seed.ts` entry point

- [x] 2. TX Log Engine — Core Slice (US-001, US-004)
  - [x] 2.1 Prisma schema — tx_log and stock_balance tables
    - **Deps**: 1.2 | **Ref**: `design.md` — Data Model (tx_log, stock_balance)
    - Add `tx_log` table with all 35+ columns per design (nullable for type-specific fields)
    - Add `stock_balance` table with unique constraint on (item_id, warehouse_id)
    - Add all indexes per design
    - Run migration
  - [x] 2.2 TxLogRepository — data access layer
    - **Deps**: 2.1 | **Ref**: `design.md` — Components (TxLogService)
    - Create `libs/master-data/data-access/src/lib/repositories/tx-log.repository.ts`
    - Methods: `create(data)`, `findById(id)`, `findMany(filters, pagination)`, `updateStatus(id, status)`
    - Enforce immutability: `updateStatus` only allows DRAFT→POSTED or POSTED→VOIDED
  - [x] 2.3 StockBalanceRepository — data access with row locking
    - **Deps**: 2.1 | **Ref**: `design.md` — Components (MaCalculationService, StockValidationService)
    - Create `libs/master-data/data-access/src/lib/repositories/stock-balance.repository.ts`
    - Methods: `findByItemWarehouse(itemId, warehouseId)`, `findByItemWarehouseForUpdate(itemId, warehouseId)` (SELECT FOR UPDATE), `upsert(data)`
    - `findByItemWarehouseForUpdate` uses Prisma `$queryRaw` with `FOR UPDATE` lock
  - [x] 2.4 PeriodRepository + PeriodService
    - **Deps**: 1.2 | **Ref**: `design.md` — Components (PeriodService)
    - Create `period.repository.ts` — `findByPeriod(period)`, `create()`, `updateStatus()`
    - Create `period.service.ts` — `validatePeriodOpen(period)` throws PeriodLockedException if CLOSED
    - Create `period.controller.ts` — GET /periods, POST /periods, PATCH /periods/:id/close
    - Unit tests for PeriodService (validate open/closed logic)
  - [x] 2.5 TxLogService — core POST pipeline
    - **Deps**: 2.2, 2.3, 2.4 | **Ref**: `design.md` — Components (TxLogService)
    - Create `tx-log.service.ts` with `createTx(dto, user)` method
    - Validation pipeline: Period check → Stock check → RefChain check → MA calculation → POST
    - Use Prisma `$transaction` to wrap entire pipeline atomically
    - Enforce immutability: reject any update on POSTED TX
    - Unit tests: successful POST, period locked, immutability violation
  - [x] 2.6 TxController — API endpoints
    - **Deps**: 2.5 | **Ref**: `design.md` — API Specification (TX Engine Endpoints)
    - Create `tx.controller.ts` — POST /tx, GET /tx, GET /tx/:id
    - Add Swagger decorators for OpenAPI docs
    - Add JwtAuthGuard, input validation (class-validator DTOs)
    - Unit tests for controller (mock service)

- [x] 3. Moving Average & Stock Validation Slice (US-002, US-003)
  - [x] 3.1 MaCalculationService
    - **Deps**: 2.3, 2.5 | **Ref**: `design.md` — Components (MaCalculationService)
    - Create `ma-calculation.service.ts`
    - `calculateNewMa(itemId, warehouseId, qty, value, isIncrease)`:
      - Acquire row lock on stock_balance via `findByItemWarehouseForUpdate`
      - If increase: `newMa = (existingTotalValue + incomingValue) / (existingQty + incomingQty)`
      - If decrease: MA unchanged, use current MA for cost
      - Update stock_balance (qty, total_value, ma)
      - Return `MaResult { maBefore, maAfter, stockBefore, stockAfter }`
    - `getCurrentMa(itemId, warehouseId)` — read current MA
    - Unit tests: increase MA calc, decrease no-change, zero stock edge case
  - [x] 3.2 StockValidationService
    - **Deps**: 2.3 | **Ref**: `design.md` — Components (StockValidationService)
    - Create `stock-validation.service.ts`
    - `validateStockAvailable(itemId, warehouseId, qty)` — throws StockNegativeException if stock_before - qty < 0
    - `getStockBalance(itemId, warehouseId)` — returns current qty
    - Check `is_frozen` flag — throw "Stock frozen during count" if frozen
    - Unit tests: sufficient stock, insufficient stock, frozen stock
  - [x] 3.3 Integrate MA + Stock into TxLogService pipeline
    - **Deps**: 3.1, 3.2, 2.5 | **Ref**: `design.md` — Components (TxLogService)
    - Wire MaCalculationService and StockValidationService into TxLogService.createTx pipeline
    - For stock-decreasing TX: validate stock → use current MA → deduct stock
    - For stock-increasing TX: calculate new MA → add stock
    - Record ma_before, ma_after, stock_before, stock_after in TX entry
    - Unit tests: full pipeline with MA and stock updates

- [x] 4. VOID Pattern Slice (US-005)
  - [x] 4.1 VoidService
    - **Deps**: 3.3 | **Ref**: `design.md` — Components (VoidService)
    - Create `void.service.ts`
    - `voidTransaction(txId, reason, user)`:
      - Validate: TX exists, status is POSTED, reason provided, user has Manager+ role
      - Create reverse TX (negate qty, costs) in single Prisma $transaction
      - Set original TX status to VOIDED
      - Set reverse TX parent_tx_id to original
      - Trigger MA recalculation for reverse movement
    - Unit tests: successful void, void already-voided, void without reason, insufficient role
  - [x] 4.2 Void API endpoint
    - **Deps**: 4.1 | **Ref**: `design.md` — API Specification (POST /tx/:id/void)
    - Add `POST /tx/:id/void` to TxController
    - Add `@Roles(Role.MANAGER, Role.CFO, Role.ADMIN)` guard
    - Request DTO: `{ reason: string }`
    - Unit tests for endpoint

- [x] 5. Reference Chain & Approval Slice (US-006, US-007)
  - [x] 5.1 RefChainValidator service
    - **Deps**: 2.2 | **Ref**: `design.md` — Components (RefChainValidator)
    - Create `ref-chain-validator.service.ts` with rule registry pattern
    - `registerRule(txType, requiredRefs[])` — add validation rules
    - `validateRefChain(txType, refFields)` — check all required refs exist and are POSTED
    - Register default rules: CN → Invoice, GR_RETURN → GR_RECEIVE, INVOICE_FROM_DO → TEMP_DO
    - Throw `RefChainInvalidException` with specific violation details
    - Unit tests: valid chain, missing ref, ref not POSTED
  - [x] 5.2 ApprovalGuard + Decorator
    - **Deps**: 2.5 | **Ref**: `design.md` — Components (ApprovalService)
    - Create `guards/approval.guard.ts` — NestJS CanActivate guard
    - Create `decorators/requires-approval.decorator.ts` — `@RequiresApproval(Role.MANAGER)`
    - Create `approval.service.ts` — `approveTx(txId, user)` sets status DRAFT→POSTED, records approved_by + timestamp
    - Throw `InsufficientRoleException` if role doesn't match
    - Unit tests: role sufficient, role insufficient, TX not in DRAFT
  - [x] 5.3 Approval API endpoint
    - **Deps**: 5.2 | **Ref**: `design.md` — API Specification (POST /tx/:id/approve)
    - Add `POST /tx/:id/approve` to TxController
    - Apply `@RequiresApproval()` guard
    - Unit tests for endpoint
  - [x] 5.4 Integrate RefChain + Approval into TxLogService
    - **Deps**: 5.1, 5.2, 3.3 | **Ref**: `design.md` — Components (TxLogService)
    - Wire RefChainValidator into TxLogService pipeline (before MA calculation)
    - Wire ApprovalService for TX types that require approval (creates as DRAFT instead of POSTED)
    - Unit tests: full pipeline with ref chain validation, approval flow

- [x] 6. Master Data CRUD Slice (supports US-001 to US-007 — provides master data for TX Engine)
  - [x] 6.1 Item CRUD (service + controller + tests)
    - **Deps**: 1.2 | **Ref**: `design.md` — API Specification (Items endpoints)
    - Create `item.repository.ts`, `item.service.ts`, `item.controller.ts`
    - Endpoints: GET /items, GET /items/:id, POST /items, PATCH /items/:id, DELETE /items/:id (soft-delete)
    - Pagination (offset-based), filter by code/name/category/is_active
    - Validation DTOs with class-validator
    - Unit tests for service logic
  - [x] 6.2 Warehouse CRUD (service + controller + tests)
    - **Deps**: 1.2 | **Ref**: `design.md` — API Specification (Warehouses endpoints)
    - Create `warehouse.repository.ts`, `warehouse.service.ts`, `warehouse.controller.ts`
    - Same pattern as Items — GET, GET/:id, POST, PATCH, DELETE (soft-delete)
    - Unit tests
  - [x] 6.3 Vendor CRUD (service + controller + tests)
    - **Deps**: 1.2 | **Ref**: `design.md` — API Specification (Vendors endpoints)
    - Create `vendor.repository.ts`, `vendor.service.ts`, `vendor.controller.ts`
    - Same CRUD pattern
    - Unit tests
  - [x] 6.4 Customer CRUD (service + controller + tests)
    - **Deps**: 1.2 | **Ref**: `design.md` — API Specification (Customers endpoints)
    - Create `customer.repository.ts`, `customer.service.ts`, `customer.controller.ts`
    - Same CRUD pattern
    - Unit tests
  - [x] 6.5 User & Role management (service + controller + tests)
    - **Deps**: 1.2 | **Ref**: `design.md` — API Specification (Users endpoints)
    - Create `user.repository.ts`, `user.service.ts`, `user.controller.ts`
    - Endpoints: GET /users, GET /users/:id, POST /users, PATCH /users/:id, POST /users/:id/roles, DELETE /users/:id/roles/:roleId
    - Password hashing (bcrypt) on create/update
    - Admin-only access (RolesGuard)
    - Unit tests
  - [x] 6.6 Stock Balance query endpoint
    - **Deps**: 2.3 | **Ref**: `design.md` — API Specification (Stock Balance Endpoints)
    - Create `stock-balance.controller.ts`
    - GET /stock-balance (list with pagination, filter by itemId/warehouseId)
    - GET /stock-balance/:itemId/:warehouseId (specific balance)
    - Unit tests

- [x] 7. Property-Based Testing (correctness properties for US-001 to US-005)
  - [x] 7.1 PBT setup + MA invariant properties (P1, P8)
    - **Deps**: 3.3 | **Ref**: `design.md` — Correctness Properties
    - Install `fast-check` dev dependency
    - Create `libs/master-data/feature/src/lib/__tests__/pbt/` directory
    - Create `ma-properties.spec.ts`:
      - P1: MA arithmetic — for any stock-increasing TX, new_ma = (old_total + incoming) / (old_qty + new_qty)
      - P8: MA consistency — stock_balance.ma * stock_balance.qty == stock_balance.total_value (±0.01 tolerance)
    - Generate random TX sequences with fast-check arbitraries
  - [x] 7.2 Stock non-negative property (P2)
    - **Deps**: 3.3 | **Ref**: `design.md` — Correctness Properties
    - Create `stock-properties.spec.ts`:
      - P2: For any sequence of TXs on same item+warehouse, stock_balance.qty >= 0 always
    - Generate random interleaved increase/decrease TXs
  - [x] 7.3 Immutability + Period Lock properties (P3, P4)
    - **Deps**: 2.5 | **Ref**: `design.md` — Correctness Properties
    - Create `immutability-properties.spec.ts`:
      - P3: After POSTED, fields never change regardless of operations attempted
      - P4: No TX with closed period can reach POSTED status
  - [x] 7.4 VOID balance property (P5)
    - **Deps**: 4.1 | **Ref**: `design.md` — Correctness Properties
    - Create `void-properties.spec.ts`:
      - P5: After VOID, net stock effect = 0 (original + reverse cancels out)
  - [x] 7.5 RefChain + Approval properties (P6, P7)
    - **Deps**: 5.4 | **Ref**: `design.md` — Correctness Properties
    - Create `ref-chain-properties.spec.ts`:
      - P6: Every TX with non-null ref_* has a corresponding POSTED TX
      - P7: DRAFT→POSTED only if approved_by has required role

- [x] 8. Frontend UI Module (Angular)
  - [x] 8.1 Angular module scaffold + routing
    - **Deps**: 6.1 | **Ref**: `design.md` — Components (MasterDataUIModule)
    - Generate `libs/master-data/ui` Angular library (if not already from 1.1)
    - Create `master-data.routes.ts` with lazy-loaded routes: /master-data/items, /warehouses, /vendors, /customers, /users, /periods, /tx-log
    - Register in `apps/web/src/app/app.routes.ts`
    - Create shared API service base using Angular HttpClient + Signals
  - [x] 8.2 Item list + form pages
    - **Deps**: 8.1 | **Ref**: `design.md` — Components (MasterDataUIModule)
    - Create `pages/item-list/` — Angular Material table with pagination, search, filter
    - Create `pages/item-form/` — Reactive form for create/edit
    - Services: `item-api.service.ts` using HttpClient + Signals for state
    - Basic responsive layout with Material components
  - [x] 8.3 Warehouse, Vendor, Customer list + form pages
    - **Deps**: 8.1 | **Ref**: `design.md` — Components (MasterDataUIModule)
    - Same pattern as 8.2 for each entity
    - Reuse shared table/form components where possible
  - [x] 8.4 User management + role assignment page
    - **Deps**: 8.1 | **Ref**: `design.md` — Components (MasterDataUIModule)
    - Create `pages/user-list/` with role chips display
    - Create user form with role multi-select
    - Admin-only guard on route
  - [x] 8.5 Period management page
    - **Deps**: 8.1 | **Ref**: `design.md` — Components (MasterDataUIModule)
    - Create `pages/period-management/` — list periods with status badges
    - Open new period button, close period confirmation dialog
    - CFO-only access
  - [x] 8.6 TX Log viewer page
    - **Deps**: 8.1 | **Ref**: `design.md` — Components (MasterDataUIModule)
    - Create `pages/tx-log-viewer/` — read-only table with advanced filters
    - Filter by: tx_type, status, period, item, warehouse, date range
    - Detail view with full TX entry (click to expand)

- [x] 9. Integration & Mock Export
  - [x] 9.1 Export service interfaces for downstream units
    - **Deps**: 5.4 | **Ref**: `design.md` — Integration Points, `foundation.md` — Integration Contracts
    - Verify `libs/shared-types/src/master-data.interface.ts` exports: ITxLogService, IMaCalculationService, IStockValidationService, IPeriodService, IRefChainService
    - Export MasterDataModule from `libs/master-data/feature/src/index.ts`
    - Ensure all exported services implement their interfaces
  - [x] 9.2 Mock implementations for downstream testing
    - **Deps**: 9.1 | **Ref**: `design.md` — Integration Points
    - Create `libs/master-data/feature/src/lib/__mocks__/` directory
    - Create `mock-tx-log.service.ts`, `mock-ma-calculation.service.ts`, `mock-stock-validation.service.ts`
    - Mock returns realistic sample data (use seed data values)
    - Other teams can import mocks for their own unit tests
  - [x] 9.3 OpenAPI/Swagger documentation setup
    - **Deps**: 6.6 | **Ref**: `design.md` — API Specification
    - Add `@nestjs/swagger` decorators to all controllers + DTOs
    - Configure Swagger UI at `/api/docs`
    - Verify all 28 endpoints documented with request/response schemas

---

## Task Summary

| Task | Title | Dependencies | Status |
|------|-------|--------------|--------|
| 1.1 | Nx library scaffold | None | [ ] |
| 1.2 | Prisma schema — base tables | 1.1 | [ ] |
| 1.3 | Seed data script | 1.2 | [ ] |
| 2.1 | Prisma schema — tx_log + stock_balance | 1.2 | [ ] |
| 2.2 | TxLogRepository | 2.1 | [ ] |
| 2.3 | StockBalanceRepository | 2.1 | [ ] |
| 2.4 | PeriodService + controller | 1.2 | [ ] |
| 2.5 | TxLogService — core pipeline | 2.2, 2.3, 2.4 | [ ] |
| 2.6 | TxController — API | 2.5 | [ ] |
| 3.1 | MaCalculationService | 2.3, 2.5 | [ ] |
| 3.2 | StockValidationService | 2.3 | [ ] |
| 3.3 | Integrate MA + Stock into pipeline | 3.1, 3.2, 2.5 | [ ] |
| 4.1 | VoidService | 3.3 | [ ] |
| 4.2 | Void API endpoint | 4.1 | [ ] |
| 5.1 | RefChainValidator | 2.2 | [ ] |
| 5.2 | ApprovalGuard + Decorator | 2.5 | [ ] |
| 5.3 | Approval API endpoint | 5.2 | [ ] |
| 5.4 | Integrate RefChain + Approval | 5.1, 5.2, 3.3 | [ ] |
| 6.1 | Item CRUD | 1.2 | [ ] |
| 6.2 | Warehouse CRUD | 1.2 | [ ] |
| 6.3 | Vendor CRUD | 1.2 | [ ] |
| 6.4 | Customer CRUD | 1.2 | [ ] |
| 6.5 | User & Role management | 1.2 | [ ] |
| 6.6 | Stock Balance query | 2.3 | [ ] |
| 7.1 | PBT — MA properties | 3.3 | [ ] |
| 7.2 | PBT — Stock non-negative | 3.3 | [ ] |
| 7.3 | PBT — Immutability + Period Lock | 2.5 | [ ] |
| 7.4 | PBT — VOID balance | 4.1 | [ ] |
| 7.5 | PBT — RefChain + Approval | 5.4 | [ ] |
| 8.1 | Angular module scaffold | 6.1 | [ ] |
| 8.2 | Item list + form | 8.1 | [ ] |
| 8.3 | Warehouse/Vendor/Customer pages | 8.1 | [ ] |
| 8.4 | User management page | 8.1 | [ ] |
| 8.5 | Period management page | 8.1 | [ ] |
| 8.6 | TX Log viewer | 8.1 | [ ] |
| 9.1 | Export service interfaces | 5.4 | [ ] |
| 9.2 | Mock implementations | 9.1 | [ ] |
| 9.3 | Swagger documentation | 6.6 | [ ] |

---

## Requirements Coverage

| Requirement | Implemented By | Status |
|-------------|----------------|--------|
| US-001 (TX Log) | 2.1, 2.2, 2.5, 2.6, 7.3 | [ ] |
| US-002 (Moving Average) | 3.1, 3.3, 7.1 | [ ] |
| US-003 (Stock Validation) | 3.2, 3.3, 7.2 | [ ] |
| US-004 (Period Lock) | 2.4, 2.5, 7.3 | [ ] |
| US-005 (VOID) | 4.1, 4.2, 7.4 | [ ] |
| US-006 (Reference Chain) | 5.1, 5.4, 7.5 | [ ] |
| US-007 (Approval) | 5.2, 5.3, 5.4, 7.5 | [ ] |

---

## Design Coverage

**Components**: 9 → Tasks: TxLogService(2.5), MaCalc(3.1), StockValid(3.2), Period(2.4), Void(4.1), Approval(5.2), RefChain(5.1), CRUD(6.1-6.5), UI(8.1-8.6)
**Entities**: 10 → Tasks: tx_log(2.1), stock_balance(2.1), period(1.2), item(1.2), warehouse(1.2), vendor(1.2), customer(1.2), user(1.2), role(1.2), user_role(1.2)
**Endpoints**: 28 → Tasks: TX Engine(2.6,4.2,5.3), Items(6.1), Warehouses(6.2), Vendors(6.3), Customers(6.4), Users(6.5), Periods(2.4), StockBalance(6.6)
**Integrations**: Mock export(9.1,9.2), Swagger docs(9.3)

---

## Definition of Done

- [x] Code written and follows NestJS + Prisma conventions
- [x] Unit tests passing (Jest)
- [x] Swagger docs complete for all endpoints
- [x] Service interfaces exported for downstream units
- [x] Mock implementations available for other teams
- [x] All 8 correctness properties verified via PBT

---

## Execution Waves

Phases grouped by dependency resolution. Each phase can be dispatched independently within a wave.

| Wave | Phases | Dependencies Resolved |
|------|--------|-----------------------|
| 1 | [1. Project Scaffold] | None |
| 2 | [2. TX Log Engine, 6. Master Data CRUD] | Wave 1 (schema ready) |
| 3 | [3. MA & Stock Validation, 5. RefChain & Approval] | Wave 2 (TxLogService, repos) |
| 4 | [4. VOID Pattern] | Wave 3 (full engine pipeline) |
| 5 | [7. PBT, 9. Integration & Mock Export] | Wave 3-4 (services complete) |
| 6 | [8. Frontend UI] | Wave 2+ (API endpoints ready) |

### File Ownership Per Wave

**Wave 2** (parallel: TX Log Engine + CRUD):
- Phase 2: `libs/master-data/data-access/src/lib/repositories/tx-log.repository.ts`, `libs/master-data/data-access/src/lib/repositories/stock-balance.repository.ts`, `libs/master-data/feature/src/lib/services/tx-log.service.ts`, `libs/master-data/feature/src/lib/services/period.service.ts`, `libs/master-data/feature/src/lib/controllers/tx.controller.ts`, `libs/master-data/feature/src/lib/controllers/period.controller.ts`, `prisma/migrations/` (tx_log + stock_balance migration)
- Phase 6: `libs/master-data/data-access/src/lib/repositories/item.repository.ts`, `libs/master-data/data-access/src/lib/repositories/warehouse.repository.ts`, `libs/master-data/data-access/src/lib/repositories/vendor.repository.ts`, `libs/master-data/data-access/src/lib/repositories/customer.repository.ts`, `libs/master-data/data-access/src/lib/repositories/user.repository.ts`, `libs/master-data/feature/src/lib/services/item.service.ts`, `libs/master-data/feature/src/lib/services/warehouse.service.ts`, `libs/master-data/feature/src/lib/services/vendor.service.ts`, `libs/master-data/feature/src/lib/services/customer.service.ts`, `libs/master-data/feature/src/lib/services/user.service.ts`, `libs/master-data/feature/src/lib/controllers/item.controller.ts`, `libs/master-data/feature/src/lib/controllers/warehouse.controller.ts`, `libs/master-data/feature/src/lib/controllers/vendor.controller.ts`, `libs/master-data/feature/src/lib/controllers/customer.controller.ts`, `libs/master-data/feature/src/lib/controllers/user.controller.ts`, `libs/master-data/feature/src/lib/controllers/stock-balance.controller.ts`

**Wave 3** (parallel: MA/Stock + RefChain/Approval):
- Phase 3: `libs/master-data/feature/src/lib/services/ma-calculation.service.ts`, `libs/master-data/feature/src/lib/services/stock-validation.service.ts`
- Phase 5: `libs/master-data/feature/src/lib/services/ref-chain-validator.service.ts`, `libs/master-data/feature/src/lib/services/approval.service.ts`, `libs/master-data/feature/src/lib/guards/`, `libs/master-data/feature/src/lib/decorators/`

**Wave 5** (parallel: PBT + Integration):
- Phase 7: `libs/master-data/feature/src/lib/__tests__/pbt/`
- Phase 9: `libs/master-data/feature/src/lib/__mocks__/`, `libs/shared-types/src/master-data.interface.ts`

---

## Notes

**Technical Debt**: None introduced — clean architecture from start.

**Future Enhancements** (deferred):
- Mapping Table export (accounting journal generation)
- WARNING/INFO alert levels
- Multi-company support
- Write-down / Reclass / Cost Adjustment TX types
- Real integration with downstream units (separate task when teams connect)
