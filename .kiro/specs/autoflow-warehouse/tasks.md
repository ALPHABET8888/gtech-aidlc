# Implementation Tasks

## Overview
Tasks organized by vertical slices — each feature (Stock Count, Transfer, Write-off) is built end-to-end before moving to the next. Mock services and data layer are built first as shared foundation.

**Derived From**:
- Requirements: 4 user stories from `requirements.md` (US-022, US-023, US-024, US-025)
- Design: 5 components, 6 entities, 14 endpoints from `design.md`

**Strategy**: Vertical Slice (with shared foundation first)
**Rationale**: User chose vertical slice — each feature is self-contained and testable independently. Mock services + data layer built first as foundation for all slices.

---

- [x] 1. Project Setup & Mock Services
  - [x] 1.1 Scaffold Warehouse Nx libraries
    - **Deps**: None | **Ref**: `design.md` — Implementation/Directory Structure
    - Generate `libs/warehouse/data-access`, `libs/warehouse/feature`, `libs/warehouse/ui` with Nx generators
    - Configure module paths in `tsconfig.base.json`
    - Add warehouse module registration in `apps/api/src/app.module.ts`
  - [x] 1.2 Create Mock Service interfaces and implementations
    - **Deps**: 1.1 | **Ref**: `design.md` — Integration Points/Mock Service Interfaces
    - Create `IMockTxLogService`, `IMockMaService`, `IMockStockValidationService`, `IMockPeriodService`, `IMockMasterDataQueryService` interfaces
    - Implement `MockTxLogService` — in-memory TX log array, returns mock TxEntry
    - Implement `MockMaService` — configurable MA from fixtures
    - Implement `MockStockValidationService` — validates against in-memory stock map, includes `validateNotFrozen()` check
    - Implement `MockPeriodService` — always returns OPEN for current period
    - Implement `MockMasterDataQueryService` — returns items/warehouses from JSON
  - [x] 1.3 Create JSON fixtures for mock data
    - **Deps**: 1.1 | **Ref**: `design.md` — Integration Points/JSON Fixtures
    - Create `fixtures/items.json` — 10+ mock items with id, name, sku, unit
    - Create `fixtures/warehouses.json` — 3+ mock warehouses with id, name, code
    - Create `fixtures/stock-balances.json` — stock per item+warehouse with qty and ma
    - Create `fixtures/periods.json` — current period OPEN, previous CLOSED
  - [x] 1.4 Create Prisma schema for warehouse entities
    - **Deps**: 1.1 | **Ref**: `design.md` — Data Model
    - Add `CountSession`, `CountLine`, `TransferOrder`, `TransferLine`, `WriteOffRequest`, `WriteOffEvidence` models to Prisma schema under `@@schema("warehouse")`
    - Define enums: `CountSessionStatus`, `TransferStatus`, `WriteOffStatus`
    - Add indexes as specified in design
    - Run `prisma migrate dev` to create migration
  - [x] 1.5 Create repository layer
    - **Deps**: 1.4 | **Ref**: `design.md` — Implementation/Directory Structure
    - Create `CountSessionRepository` — CRUD + query by warehouse/status
    - Create `TransferOrderRepository` — CRUD + query by source/dest warehouse
    - Create `WriteOffRepository` — CRUD + query by warehouse/status
    - All repositories use Prisma client with warehouse schema

- [x] 2. Stock Count — Backend (US-022, US-023)
  - [x] 2.1 Implement StockCountService — initiate & freeze
    - **Deps**: 1.2, 1.5 | **Ref**: `design.md` — Components/StockCountService
    - `initiateCount(dto)` — create CountSession with INITIATED status, create CountLines with `is_frozen=true`, capture `system_qty` and `system_ma` from MockStockValidationService
    - Validate items not already frozen (check CountLine.is_frozen)
    - Transition to COUNTING status after creation
  - [x] 2.2 Implement StockCountService — record results & submit
    - **Deps**: 2.1 | **Ref**: `design.md` — Components/StockCountService
    - `recordResult(sessionId, lineId, dto)` — set `physical_qty`, calculate `difference`, require `reason_code` if difference != 0
    - `submitForApproval(sessionId)` — validate all lines have physical_qty, transition to PENDING_APPROVAL
    - Validate session is in COUNTING status before recording
  - [x] 2.3 Implement StockCountService — approve & POST adjustments
    - **Deps**: 2.2 | **Ref**: `design.md` — Components/StockCountService
    - `approveCount(sessionId, userId)` — transition to APPROVED
    - For each line with difference != 0: POST ADJ_COUNT_UP (if positive) or ADJ_COUNT_DOWN (if negative) via MockTxLogService
    - ADJ_COUNT_UP: call MockMaService.calculateNewMa() for MA recalculation
    - ADJ_COUNT_DOWN: validate stock >= 0 via MockStockValidationService, MA unchanged
    - Set `tx_id` on each CountLine, unfreeze (`is_frozen=false`), transition to COMPLETED
  - [x] 2.4 Implement Stock Count API endpoints
    - **Deps**: 2.3 | **Ref**: `design.md` — API Specification/Stock Count Endpoints
    - `POST /api/v1/warehouse/count-sessions` — create session (Supervisor+)
    - `GET /api/v1/warehouse/count-sessions` — list with pagination
    - `GET /api/v1/warehouse/count-sessions/:id` — detail with lines
    - `PATCH /api/v1/warehouse/count-sessions/:id/lines/:lineId` — record count
    - `POST /api/v1/warehouse/count-sessions/:id/submit` — submit for approval
    - `POST /api/v1/warehouse/count-sessions/:id/approve` — approve & POST
    - Add DTOs with class-validator, OpenAPI decorators, role guards
  - [x] 2.5 Write Stock Count tests
    - **Deps**: 2.4 | **Ref**: `design.md` — Correctness Properties P1-P5, P9
    - Unit tests: StockCountService (initiate, record, submit, approve flows)
    - Integration tests: full API flow via Supertest (create → count → submit → approve)
    - PBT: P1 (freeze blocks TX), P2 (difference accuracy), P3 (stock non-negative after down), P4 (MA correct after up), P5 (MA unchanged after down), P9 (lifecycle order)

- [x] 3. Stock Transfer — Backend (US-024)
  - [x] 3.1 Implement StockTransferService
    - **Deps**: 1.2, 1.5 | **Ref**: `design.md` — Components/StockTransferService
    - `initiateTransfer(dto)` — validate source != dest, validate source stock sufficient via MockStockValidationService
    - Create TransferOrder + TransferLines
    - Atomic operation: decrease source stock (MA unchanged) + increase dest stock (MA recalculated via MockMaService)
    - POST single ADJ_TRANSFER TX via MockTxLogService
    - Set status to POSTED, record `tx_id` on lines
  - [x] 3.2 Implement Stock Transfer API endpoints
    - **Deps**: 3.1 | **Ref**: `design.md` — API Specification/Stock Transfer Endpoints
    - `POST /api/v1/warehouse/transfers` — create & POST transfer (Supervisor+)
    - `GET /api/v1/warehouse/transfers` — list with pagination
    - `GET /api/v1/warehouse/transfers/:id` — detail with lines
    - Add DTOs with class-validator, OpenAPI decorators, role guards
  - [x] 3.3 Write Stock Transfer tests
    - **Deps**: 3.2 | **Ref**: `design.md` — Correctness Properties P6, P7
    - Unit tests: StockTransferService (happy path, insufficient stock, same warehouse rejection)
    - Integration tests: full API flow via Supertest
    - PBT: P6 (transfer conservation — total stock unchanged), P7 (source non-negative)

- [x] 4. Stock Write-off — Backend (US-025)
  - [x] 4.1 Implement WriteOffService
    - **Deps**: 1.2, 1.5 | **Ref**: `design.md` — Components/WriteOffService
    - `requestWriteOff(dto)` — create WriteOffRequest with PENDING_APPROVAL, validate stock sufficient, capture current MA as `unit_cost`, calculate `total_loss`
    - `uploadEvidence(writeOffId, file)` — save file to local uploads directory, create WriteOffEvidence record
    - `approveWriteOff(writeOffId, userId)` — validate at least 1 evidence exists, validate CFO role
    - POST ADJ_WRITEOFF via MockTxLogService (decrease stock at MA, MA unchanged)
    - Set status to POSTED, record `tx_id`
    - Handle salvage value if provided
  - [x] 4.2 Implement Write-off API endpoints
    - **Deps**: 4.1 | **Ref**: `design.md` — API Specification/Write-off Endpoints
    - `POST /api/v1/warehouse/write-offs` — create request (Supervisor+)
    - `POST /api/v1/warehouse/write-offs/:id/evidence` — upload file (multipart)
    - `POST /api/v1/warehouse/write-offs/:id/approve` — CFO approve & POST
    - `GET /api/v1/warehouse/write-offs` — list with pagination
    - `GET /api/v1/warehouse/write-offs/:id` — detail with evidence
    - Configure Multer for file upload, add file size limit (10MB)
    - Add DTOs, OpenAPI decorators, role guards
  - [x] 4.3 Write Write-off tests
    - **Deps**: 4.2 | **Ref**: `design.md` — Correctness Properties P8
    - Unit tests: WriteOffService (request, upload, approve, reject without evidence)
    - Integration tests: full API flow via Supertest including file upload
    - PBT: P8 (write-off requires evidence — no approved write-off without at least 1 evidence)

- [ ] 5. Warehouse Module Integration
  - [ ] 5.1 Wire WarehouseModule and register in API app
    - **Deps**: 2.4, 3.2, 4.2 | **Ref**: `design.md` — Architecture
    - Create `WarehouseModule` importing all services, repositories, mock services
    - Register in `apps/api/src/app.module.ts`
    - Configure DI tokens for mock services (replaceable with real services later)
    - Add OpenAPI tags and module-level documentation
  - [ ] 5.2 Integration test — full warehouse module
    - **Deps**: 5.1 | **Ref**: `design.md` — all endpoints
    - End-to-end integration test: count session → transfer → write-off in sequence
    - Verify mock services track state correctly across operations
    - Verify freeze blocks transfer during active count

- [ ] 6. Angular Frontend — Warehouse UI
  - [ ] 6.1 Scaffold Angular warehouse module and routing
    - **Deps**: 5.1 | **Ref**: `design.md` — Components/WarehouseUIModule
    - Generate `libs/warehouse/ui` Angular module with lazy-loaded routing
    - Configure routes: `/warehouse/count`, `/warehouse/transfers`, `/warehouse/write-offs`
    - Create `WarehouseApiService` HTTP client service
    - Add Angular Material module imports
  - [ ] 6.2 Implement Stock Count UI pages
    - **Deps**: 6.1 | **Ref**: `design.md` — Components/WarehouseUIModule
    - Count Session List page — table with status filter, pagination
    - Count Session Create page — warehouse picker, item multi-select
    - Count Session Detail page — line-by-line count entry, difference display, submit/approve buttons
    - Use Angular Material: mat-table, mat-select, mat-stepper, mat-button
  - [ ] 6.3 Implement Transfer UI pages
    - **Deps**: 6.1 | **Ref**: `design.md` — Components/WarehouseUIModule
    - Transfer List page — table with source/dest filter
    - Transfer Create page — source/dest warehouse pickers, item+qty lines, submit
    - Use Angular Material: mat-table, mat-select, mat-form-field
  - [ ] 6.4 Implement Write-off UI pages
    - **Deps**: 6.1 | **Ref**: `design.md` — Components/WarehouseUIModule
    - Write-off List page — table with status filter
    - Write-off Create page — warehouse/item picker, qty, reason, file upload
    - Write-off Detail page — evidence gallery, approve button (CFO only)
    - Use Angular Material: mat-table, mat-form-field, mat-file-upload (custom)

---

## Task Summary

| Task | Title | Dependencies | Status |
|------|-------|--------------|--------|
| 1.1 | Scaffold Warehouse Nx libraries | None | [ ] |
| 1.2 | Create Mock Service interfaces and implementations | 1.1 | [ ] |
| 1.3 | Create JSON fixtures for mock data | 1.1 | [ ] |
| 1.4 | Create Prisma schema for warehouse entities | 1.1 | [ ] |
| 1.5 | Create repository layer | 1.4 | [ ] |
| 2.1 | StockCountService — initiate & freeze | 1.2, 1.5 | [ ] |
| 2.2 | StockCountService — record results & submit | 2.1 | [ ] |
| 2.3 | StockCountService — approve & POST | 2.2 | [ ] |
| 2.4 | Stock Count API endpoints | 2.3 | [ ] |
| 2.5 | Stock Count tests | 2.4 | [ ] |
| 3.1 | StockTransferService | 1.2, 1.5 | [x] |
| 3.2 | Stock Transfer API endpoints | 3.1 | [x] |
| 3.3 | Stock Transfer tests | 3.2 | [x] |
| 4.1 | WriteOffService | 1.2, 1.5 | [x] |
| 4.2 | Write-off API endpoints | 4.1 | [x] |
| 4.3 | Write-off tests | 4.2 | [x] |
| 5.1 | Wire WarehouseModule | 2.4, 3.2, 4.2 | [ ] |
| 5.2 | Integration test — full module | 5.1 | [ ] |
| 6.1 | Scaffold Angular warehouse module | 5.1 | [ ] |
| 6.2 | Stock Count UI pages | 6.1 | [ ] |
| 6.3 | Transfer UI pages | 6.1 | [ ] |
| 6.4 | Write-off UI pages | 6.1 | [ ] |

---

## Requirements Coverage

| Requirement | Implemented By | Status |
|-------------|----------------|--------|
| US-022 (Stock Count Up) | 2.1, 2.2, 2.3, 2.4, 2.5, 6.2 | [ ] |
| US-023 (Stock Count Down) | 2.1, 2.2, 2.3, 2.4, 2.5, 6.2 | [ ] |
| US-024 (Stock Transfer) | 3.1, 3.2, 3.3, 6.3 | [ ] |
| US-025 (Stock Write-off) | 4.1, 4.2, 4.3, 6.4 | [ ] |

---

## Design Coverage

**Components**: 5 → StockCountService (2.1-2.3), StockTransferService (3.1), WriteOffService (4.1), WarehouseController (2.4, 3.2, 4.2), WarehouseUIModule (6.1-6.4)
**Entities**: 6 → CountSession, CountLine (1.4), TransferOrder, TransferLine (1.4), WriteOffRequest, WriteOffEvidence (1.4)
**Endpoints**: 14 → Stock Count (2.4: 6 endpoints), Transfer (3.2: 3 endpoints), Write-off (4.2: 5 endpoints)
**Integrations**: 5 mock services → (1.2)
**PBT Properties**: 9 → P1-P5, P9 (2.5), P6-P7 (3.3), P8 (4.3)

---

## Definition of Done

- [ ] Code written and follows NestJS/Angular conventions
- [ ] Unit tests passing (Jest)
- [ ] Integration tests passing (Supertest)
- [ ] PBT properties verified (fast-check)
- [ ] OpenAPI documentation generated
- [ ] Code linted (ESLint + Prettier)

---

## Execution Waves

Phases grouped by dependency resolution. Tasks within each phase are executed sequentially.

| Wave | Phases | Dependencies Resolved |
|------|--------|-----------------------|
| 1 | [1. Project Setup & Mock Services] | None (foundation) |
| 2 | [2. Stock Count, 3. Stock Transfer, 4. Stock Write-off] | Wave 1 (mock services + data layer ready) |
| 3 | [5. Warehouse Module Integration] | Wave 2 (all backend features complete) |
| 4 | [6. Angular Frontend] | Wave 3 (backend wired and tested) |

### File Ownership Per Wave

**Wave 2** (parallel — 3 phases):
- Phase 2 (Stock Count): `libs/warehouse/feature/src/lib/services/stock-count.service.ts`, `libs/warehouse/feature/src/lib/controllers/count-session.controller.ts`, `libs/warehouse/feature/src/lib/dto/create-count-session.dto.ts`, `libs/warehouse/feature/src/lib/dto/record-count-result.dto.ts`, `libs/warehouse/feature/src/__tests__/stock-count*`
- Phase 3 (Transfer): `libs/warehouse/feature/src/lib/services/stock-transfer.service.ts`, `libs/warehouse/feature/src/lib/controllers/transfer.controller.ts`, `libs/warehouse/feature/src/lib/dto/create-transfer.dto.ts`, `libs/warehouse/feature/src/__tests__/stock-transfer*`
- Phase 4 (Write-off): `libs/warehouse/feature/src/lib/services/write-off.service.ts`, `libs/warehouse/feature/src/lib/controllers/write-off.controller.ts`, `libs/warehouse/feature/src/lib/dto/create-write-off.dto.ts`, `libs/warehouse/feature/src/__tests__/write-off*`

**Wave 4** (parallel — 3 UI phases):
- Task 6.2: `libs/warehouse/ui/src/lib/pages/count-session-*`
- Task 6.3: `libs/warehouse/ui/src/lib/pages/transfer-*`
- Task 6.4: `libs/warehouse/ui/src/lib/pages/write-off-*`

---

## Notes

**Technical Debt**:
- Mock services จะถูกแทนที่ด้วย real Master Data services เมื่อ Team 1 เสร็จ — ใช้ DI token swap
- File upload ใช้ local storage — migrate to S3 ใน production phase

**Future Enhancements**:
- Link กับ real Master Data services (separate task after team integration)
- Barcode scanning for stock count
- Batch transfer (multiple items in one request — already supported in design)
- Write-off reporting dashboard (Unit 4 — Reports team)
