# Implementation Tasks — Unit: transactions (ข้อมูลพื้นฐาน)

## Overview
Tasks organized by vertical slices with infrastructure-first prerequisite (D4-1 + D4-3).

**Derived From**:
- Requirements: 16 user stories from `requirements.md` (US-008 to US-021, US-026, US-027)
- Design: 5 components, 6 entities, 19 endpoints from `design/` folder

**Strategy**: Vertical Slice with Infrastructure-First
**Rationale**: สร้าง mock layer + data layer ก่อนเป็น prerequisite แล้วสร้างทีละ flow ครบ end-to-end (backend service + controller + frontend page + tests) ตาม domain priority: Sales → Purchasing → AP/AR

---

- [x] 1. Infrastructure Setup (Mock + Data Layer)
  - [x] 1.1 Create Nx libraries and module scaffold [S]
    - **Deps**: None | **Ref**: `design/implementation.md` — Directory Structure
    - สร้าง `libs/transactions/data-access`, `libs/transactions/feature`, `libs/transactions/ui` ด้วย Nx generators
    - สร้าง `TransactionsModule` (NestJS) พร้อม imports (MasterDataMockModule, SharedAuthModule, SharedPrismaModule)
    - สร้าง Angular lazy-loaded routes ใน `transactions.routes.ts`
    - Register module ใน `apps/api/src/app.module.ts` และ `apps/web/src/app.routes.ts`
  - [x] 1.2 Create Master Data Mock Module [M]
    - **Deps**: 1.1 | **Ref**: `design/integration.md` — Mock Module Configuration
    - สร้าง `MasterDataMockModule` พร้อม DI providers ทั้ง 6 interfaces
    - Implement `MockTxLogService` — return fake TxEntry with UUID
    - Implement `MockMaCalculationService` — configurable MA values
    - Implement `MockStockValidationService` — configurable pass/throw
    - Implement `MockPeriodService` — configurable pass/throw
    - Implement `MockRefChainService` — configurable pass/throw
    - Implement `MockMasterDataLookupService` — read from JSON fixtures
    - สร้าง mock-data JSON fixtures (items.json, vendors.json, customers.json, warehouses.json)
    - เขียน README.md อธิบายวิธี configure mocks + วิธี swap to real
  - [x] 1.3 Create Prisma schema + migration (transactions schema) [M]
    - **Deps**: 1.1 | **Ref**: `design/data-model.md` — Prisma Schema
    - เพิ่ม models ใน `prisma/schema.prisma`: JobOrder, APOpenItem, AROpenItem, APPaymentAllocation, ARPaymentAllocation, GrIrClearing
    - เพิ่ม enums: JOStatus, ApArStatus, ClearingStatus
    - สร้าง migration: `npx prisma migrate dev --name add-transactions-schema`
    - สร้าง repositories: JobOrderRepository, ApOpenItemRepository, ArOpenItemRepository, GrIrClearingRepository
  - [x] 1.4 Create shared DTOs and domain exceptions [S]
    - **Deps**: 1.1 | **Ref**: `design/components.md` — Error Handling
    - สร้าง DTOs ทั้งหมดใน `dto/` folders (Sales, Purchasing, AP/AR)
    - สร้าง domain exceptions: JoNotDoneException, DuplicateTempDoException, DuplicateInvoiceException, ReturnQtyExceededException, GrAlreadyReturnedException, CnReturnInventoryException, ClearingNotOpenException, PaymentExceedsBalanceException, OpenItemNotFoundException

- [x] 2. Sales Flow — Job Order + Invoice (Vertical Slice)
  - [x] 2.1 Implement Job Order service + controller [M]
    - **Deps**: 1.1, 1.3, 1.4 | **Ref**: `design/components.md` — SalesService, `design/api-spec.md` — Job Orders
    - Implement `JobOrderService`: createJobOrder, updateStatus (state machine validation OPEN→IN_PROGRESS→DONE)
    - Implement `SalesController`: POST /job-orders, GET /job-orders, GET /job-orders/:id, PATCH /job-orders/:id/status
    - Pagination: offset-based (page/limit) สำหรับ list endpoint
    - Stories: US-008
  - [x] 2.2 Implement TEMP_DO + Invoice issuance (dual-path) [L]
    - **Deps**: 2.1, 1.2 | **Ref**: `design/components.md` — SalesService, `design/api-spec.md` — Sales Invoice & TEMP_DO
    - Implement `InvoiceService`: issueTempDO (Path A), issueInvoice (auto-determines INVOICE_FROM_DO vs SALE_INVOICE)
    - Call mock services: stock validation, MA calculation, TX Log creation, period check
    - Create AR Open Item on TEMP_DO/SALE_INVOICE POST
    - Implement `SalesController`: POST /job-orders/:joId/temp-do, POST /job-orders/:joId/invoice
    - Validate: JO status=DONE, no duplicate TEMP_DO, no duplicate invoice, stock sufficient
    - Stories: US-009, US-010, US-011
  - [x] 2.3 Implement Sales Credit Notes (CN_SALES_RETURN + CN_SALES_PRICE) [M]
    - **Deps**: 2.2 | **Ref**: `design/components.md` — SalesService, `design/api-spec.md` — Sales CN
    - Implement `SalesCnService`: createSalesReturn (condition: good/damaged_total), createSalesPriceAdj
    - CN_SALES_RETURN: stock return (good) or loss (damaged), AR reduction, VAT reversal
    - CN_SALES_PRICE: AR reduction only, no inventory impact, requires reason + Manager approval (DRAFT→POSTED)
    - Implement `SalesController`: POST /sales-cn/return, POST /sales-cn/price-adj
    - Stories: US-012, US-013
  - [x] 2.4 Implement Sales frontend pages [M]
    - **Deps**: 2.1, 2.2, 2.3 | **Ref**: `design/components.md` — TransactionsFeatureModule
    - สร้าง `TransactionsApiService` (HttpClient calls)
    - สร้าง `TransactionsStateService` (Angular Signals)
    - สร้าง pages: job-order-list, job-order-create, job-order-detail, invoice-create, sales-cn-create
    - Template-driven forms พร้อม custom validators
    - Stories: US-008, US-009, US-010, US-011, US-012, US-013
  - [x] 2.5 Write unit + integration tests for Sales flow [M]
    - **Deps**: 2.1, 2.2, 2.3 | **Ref**: `design/correctness.md` — Properties 4, 7, 8
    - Unit tests: JobOrderService, InvoiceService, SalesCnService (mock all dependencies)
    - Integration tests: Full sales flow with mock module + test DB
    - Test JO state machine transitions (valid + invalid)
    - Test invoice path determination (hasTempDo=true/false)
    - Test CN return qty validation

- [x] 3. Purchasing Flow (Vertical Slice)
  - [x] 3.1 Implement GR_RECEIVE + GR_RETURN + GR_REPLACEMENT [L]
    - **Deps**: 1.2, 1.3, 1.4 | **Ref**: `design/components.md` — PurchasingService, `design/api-spec.md` — Purchasing GR
    - Implement `GoodsReceiptService`: createGoodsReceipt (stock + MA + AP), createGoodsReturn (stock decrease + clearing open), receiveReplacement (stock from clearing + clearing close)
    - Implement `GrIrClearingService`: openClearing, closeByReplacement, closeByCnReturn
    - Implement `PurchasingController`: POST /purchasing/gr-receive, POST /purchasing/gr-return, POST /purchasing/gr-replacement
    - Call mock services: TX Log, MA, stock validation, period check
    - Create AP Open Item on GR_RECEIVE
    - Stories: US-015, US-016, US-017
  - [x] 3.2 Implement Purchase Credit Notes (CN_RETURN + CN_PRICE_ADJ + AP_CN_DEBT) [L]
    - **Deps**: 3.1 | **Ref**: `design/components.md` — PurchasingService, `design/api-spec.md` — Purchasing CN
    - Implement `PurchaseCnService`: createCnReturn (AP reduction + PPV + clearing close), createCnPriceAdj (inventory + AP), createCnDebt (AP only)
    - CN_RETURN: inherit refs from GR_RETURN, calculate PPV, close clearing, no inventory impact
    - CN_PRICE_ADJ: check remaining stock, adjust inventory + AP, recalculate MA
    - AP_CN_DEBT: AP reduction only, requires reason
    - Implement `PurchasingController`: POST /purchasing/cn-return, POST /purchasing/cn-price-adj, POST /purchasing/cn-debt
    - Stories: US-018, US-019, US-020
  - [x] 3.3 Implement Purchasing frontend pages [M]
    - **Deps**: 3.1, 3.2 | **Ref**: `design/components.md` — TransactionsFeatureModule
    - สร้าง pages: gr-receive-create, gr-return-create, purchase-cn-create
    - Template-driven forms พร้อม vendor/item selection (from mock data)
    - GR/IR Clearing list view
    - Stories: US-015, US-016, US-017, US-018, US-019, US-020
  - [x] 3.4 Write unit + integration tests for Purchasing flow [M]
    - **Deps**: 3.1, 3.2 | **Ref**: `design/correctness.md` — Properties 5, 6
    - Unit tests: GoodsReceiptService, PurchaseCnService, GrIrClearingService
    - Integration tests: Full purchasing flow (GR → Return → CN/Replacement)
    - Test clearing lifecycle (open → close by CN or replacement)
    - Test PPV calculation correctness
    - Test CN_RETURN inventory protection (must not touch inventory)

- [x] 4. AP/AR Payment Flow (Vertical Slice)
  - [x] 4.1 Implement AP/AR Open Item services [M]
    - **Deps**: 1.2, 1.3, 1.4 | **Ref**: `design/components.md` — ApArService, `design/data-model.md` — APOpenItem, AROpenItem
    - Implement `ApService`: createApOpenItem, reduceApByCn, getOpenApItems (paginated)
    - Implement `ArService`: createArOpenItem, reduceArByCn, getOpenArItems (paginated)
    - Status lifecycle: OPEN → PARTIAL → CLOSED (automatic based on remainingAmount)
    - Stories: US-026, US-027
  - [x] 4.2 Implement Payment Matching (AP_PAYMENT + AR_RECEIVE) [M]
    - **Deps**: 4.1 | **Ref**: `design/components.md` — ApArService, `design/api-spec.md` — AP/AR Payment
    - Implement `PaymentMatchingService`: allocatePayment (validate sum = total, update each open item)
    - Implement AP payment: POST /ap/payments (Manager+)
    - Implement AR payment: POST /ar/payments (Cashier+)
    - Validate: allocation sum = totalAmount, payment ≤ open balance
    - Implement list endpoints: GET /ap/open-items, GET /ar/open-items
    - Stories: US-014, US-021
  - [x] 4.3 Implement AP/AR frontend pages [M]
    - **Deps**: 4.1, 4.2 | **Ref**: `design/components.md` — TransactionsFeatureModule
    - สร้าง pages: ap-list, ar-list, ap-payment, ar-payment
    - สร้าง shared components: payment-allocation (drag/select open items + enter amounts), open-item-selector
    - Stories: US-014, US-021, US-026, US-027
  - [x] 4.4 Write unit + integration tests for AP/AR flow [M]
    - **Deps**: 4.1, 4.2 | **Ref**: `design/correctness.md` — Properties 1, 2, 3
    - Unit tests: ApService, ArService, PaymentMatchingService
    - Integration tests: Full AP/AR lifecycle (create → partial pay → CN reduce → close)
    - Test status transitions (OPEN → PARTIAL → CLOSED)
    - Test payment allocation sum validation

- [x] 5. Property-Based Tests [M]
  - [x] 5.1 Implement PBT for AP/AR lifecycle (Properties 1, 2) [M]
    - **Deps**: 4.1, 4.2 | **Ref**: `design/correctness.md` — Properties 1, 2
    - Property 1: Balance invariant (remaining = original - payments - cnReductions)
    - Property 2: Status consistency (CLOSED when 0, PARTIAL when between, OPEN when full)
    - ใช้ fast-check generators สำหรับ random amounts
  - [x] 5.2 Implement PBT for Payment Matching (Property 3) [S]
    - **Deps**: 4.2 | **Ref**: `design/correctness.md` — Property 3
    - Property 3: Allocation sum invariant (no money leak)
  - [x] 5.3 Implement PBT for JO State Machine (Property 4) [S]
    - **Deps**: 2.1 | **Ref**: `design/correctness.md` — Property 4
    - Property 4: No invalid transitions (only OPEN→IN_PROGRESS→DONE)
  - [x] 5.4 Implement PBT for Clearing + PPV (Properties 5, 6) [M]
    - **Deps**: 3.1, 3.2 | **Ref**: `design/correctness.md` — Properties 5, 6
    - Property 5: Clearing open/close consistency (close only once)
    - Property 6: PPV calculation correctness
  - [x] 5.5 Implement PBT for Invoice Path (Properties 7, 8) [S]
    - **Deps**: 2.2 | **Ref**: `design/correctness.md` — Properties 7, 8
    - Property 7: Mutual exclusivity (hasTempDo → INVOICE_FROM_DO, !hasTempDo → SALE_INVOICE)
    - Property 8: INVOICE_FROM_DO zero invariant (qty=0, cost=0, ar=0)

- [x] 6. E2E Tests + OpenAPI Documentation [M]
  - [x] 6.1 Generate OpenAPI/Swagger documentation [S]
    - **Deps**: 2.1, 3.1, 4.2 | **Ref**: `design/api-spec.md`
    - เพิ่ม @ApiTags, @ApiOperation, @ApiResponse decorators ใน controllers ทั้งหมด
    - Verify Swagger UI แสดง endpoints ครบ 19 endpoints
  - [x] 6.2 Write E2E tests for critical flows [L]
    - **Deps**: 2.4, 3.3, 4.3 | **Ref**: `design/api-spec.md`
    - E2E: Job Order → TEMP_DO → INVOICE_FROM_DO (Path A complete flow)
    - E2E: Job Order → SALE_INVOICE (Path B complete flow)
    - E2E: GR_RECEIVE → GR_RETURN → CN_RETURN (Purchasing + clearing flow)
    - E2E: AP Payment matching (multiple open items)
    - ใช้ Playwright สำหรับ frontend E2E

---

## Task Summary

| Task | Title | Size | Dependencies | Status |
|------|-------|------|--------------|--------|
| 1.1 | Nx libraries + module scaffold | S | None | [ ] |
| 1.2 | Master Data Mock Module | M | 1.1 | [ ] |
| 1.3 | Prisma schema + migration | M | 1.1 | [ ] |
| 1.4 | Shared DTOs + domain exceptions | S | 1.1 | [ ] |
| 2.1 | Job Order service + controller | M | 1.1, 1.3, 1.4 | [ ] |
| 2.2 | TEMP_DO + Invoice (dual-path) | L | 2.1, 1.2 | [ ] |
| 2.3 | Sales Credit Notes | M | 2.2 | [ ] |
| 2.4 | Sales frontend pages | M | 2.1, 2.2, 2.3 | [ ] |
| 2.5 | Sales unit + integration tests | M | 2.1, 2.2, 2.3 | [ ] |
| 3.1 | GR + Return + Replacement | L | 1.2, 1.3, 1.4 | [ ] |
| 3.2 | Purchase Credit Notes | L | 3.1 | [ ] |
| 3.3 | Purchasing frontend pages | M | 3.1, 3.2 | [ ] |
| 3.4 | Purchasing unit + integration tests | M | 3.1, 3.2 | [ ] |
| 4.1 | AP/AR Open Item services | M | 1.2, 1.3, 1.4 | [ ] |
| 4.2 | Payment Matching (AP + AR) | M | 4.1 | [ ] |
| 4.3 | AP/AR frontend pages | M | 4.1, 4.2 | [ ] |
| 4.4 | AP/AR unit + integration tests | M | 4.1, 4.2 | [ ] |
| 5.1 | PBT: AP/AR lifecycle | M | 4.1, 4.2 | [ ] |
| 5.2 | PBT: Payment matching | S | 4.2 | [ ] |
| 5.3 | PBT: JO state machine | S | 2.1 | [ ] |
| 5.4 | PBT: Clearing + PPV | M | 3.1, 3.2 | [ ] |
| 5.5 | PBT: Invoice path | S | 2.2 | [ ] |
| 6.1 | OpenAPI/Swagger docs | S | 2.1, 3.1, 4.2 | [ ] |
| 6.2 | E2E tests (critical flows) | L | 2.4, 3.3, 4.3 | [ ] |

---

## Requirements Coverage

| Requirement | Implemented By | Status |
|-------------|----------------|--------|
| US-008 | 2.1, 2.4 | [ ] |
| US-009 | 2.2, 2.4 | [ ] |
| US-010 | 2.2, 2.4 | [ ] |
| US-011 | 2.2, 2.4 | [ ] |
| US-012 | 2.3, 2.4 | [ ] |
| US-013 | 2.3, 2.4 | [ ] |
| US-014 | 4.2, 4.3 | [ ] |
| US-015 | 3.1, 3.3 | [ ] |
| US-016 | 3.1, 3.3 | [ ] |
| US-017 | 3.1, 3.3 | [ ] |
| US-018 | 3.2, 3.3 | [ ] |
| US-019 | 3.2, 3.3 | [ ] |
| US-020 | 3.2, 3.3 | [ ] |
| US-021 | 4.2, 4.3 | [ ] |
| US-026 | 4.1, 4.3 | [ ] |
| US-027 | 4.1, 4.3 | [ ] |

---

## Design Coverage

**Components**: 5 components → Tasks 1.2 (Mock), 2.1-2.3 (Sales), 3.1-3.2 (Purchasing), 4.1-4.2 (AP/AR), 2.4+3.3+4.3 (Frontend)
**Entities**: 6 entities → Task 1.3 (all Prisma models)
**Endpoints**: 19 endpoints → Tasks 2.1 (4), 2.2 (2), 2.3 (2), 3.1 (3), 3.2 (3), 4.1 (2), 4.2 (3)
**Integrations**: 6 mock interfaces → Task 1.2
**PBT Properties**: 8 properties → Tasks 5.1-5.5

---

## Definition of Done

- [x] Code written and follows naming conventions (kebab-case files, PascalCase classes)
- [x] Unit tests written and passing (Jest)
- [x] Integration tests passing (Supertest + test DB)
- [x] PBT properties passing (fast-check)
- [x] OpenAPI decorators added to controllers
- [x] Code review completed
- [x] All 16 user stories' acceptance criteria met

---

## Execution Waves

Phases grouped by dependency resolution. Tasks within each phase are executed sequentially.

| Wave | Phases | Dependencies Resolved |
|------|--------|-----------------------|
| 1 | 1. Infrastructure Setup | None (scaffold + mock + schema) |
| 2 | 2. Sales Flow, 3. Purchasing Flow, 4. AP/AR Flow | Wave 1 (all need mock + schema) |
| 3 | 5. PBT, 6. E2E + Docs | Wave 2 (need services implemented) |

### File Ownership Per Wave

**Wave 1** (sequential — single phase):
- Phase 1: `libs/transactions/` (all), `prisma/schema.prisma` (transactions models only)

**Wave 2** (parallel — 3 phases):
- Phase 2 (Sales): `libs/transactions/feature/src/sales/`, `libs/transactions/ui/src/pages/job-order/`, `libs/transactions/ui/src/pages/sales/`
- Phase 3 (Purchasing): `libs/transactions/feature/src/purchasing/`, `libs/transactions/ui/src/pages/purchasing/`
- Phase 4 (AP/AR): `libs/transactions/feature/src/ap-ar/`, `libs/transactions/ui/src/pages/ap-ar/`, `libs/transactions/ui/src/components/`

**Wave 3** (parallel — 2 phases):
- Phase 5 (PBT): `tests/properties/`
- Phase 6 (E2E + Docs): `tests/e2e/`, controller decorators (read-only additions)

---

## Notes

**Technical Debt**:
- Mock layer ต้อง swap เป็น real MasterDataModule เมื่อ Team 1 พร้อม (separate linking task)
- Template-driven forms อาจต้อง refactor เป็น Reactive Forms ถ้า validation complexity เพิ่มขึ้น

**Future Enhancements** (deferred):
- Mapping Table export (deferred from MVP)
- WARNING/INFO alerts (MVP = ERROR only)
- Multi-company support
- Write-down / Reclass / Cost Adjustment TX types
