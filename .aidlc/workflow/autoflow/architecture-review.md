# Solutions Review — autoflow

## Review Summary

- **Date**: 2026-05-20T10:00:00Z
- **Units Reviewed**: master-data (ข้อมูลหลัก), transactions (ข้อมูลพื้นฐาน), warehouse (คลังสินค้า)
- **Alignment Status**: Partially Aligned
- **Issues**: 2 critical, 4 major, 3 minor

---

## Findings

### 🔴 Critical Issues

#### CR-1: Pagination Response Format Mismatch — `pagination` vs `meta`

**Affected Units**: master-data, transactions, warehouse
**Category**: Architectural
**Description**: Units use different pagination response envelope keys:
- **master-data** returns: `{ data: [...], pagination: { page, pageSize, total, totalPages } }`
- **transactions** returns: `{ data: [...], meta: { page, limit, total, totalPages } }`
- **warehouse** returns: `{ data: [...], pagination: { page, limit, total, totalPages } }`

Additionally, the page size parameter name differs:
- master-data uses `pageSize` (both in query params and response)
- transactions uses `limit` (both in query params and response)
- warehouse uses `limit` (query params and response)

**Impact**: Frontend Angular app must handle two different response shapes. Shared pagination components, interceptors, or generic table components cannot work uniformly. When the frontend team builds cross-unit features (e.g., a dashboard showing data from multiple units), they'll need unit-specific parsing logic.

**Recommendation**: Standardize on a single format. Recommended: `{ data: [...], pagination: { page, limit, total, totalPages } }` with query param `?page=1&limit=20`. This aligns with warehouse and transactions (majority), and master-data should change `pageSize` → `limit` and keep the `pagination` key it already uses.

**Alternatives**: 
- Create a shared `PaginatedResponseDto` in `libs/shared-types/` that all units import
- Use a NestJS interceptor to normalize responses at the API gateway level

**Effort**: small (master-data needs to rename `pageSize` → `limit` in DTOs, response objects, and tests)

---

#### CR-2: DI Token Naming Conflict — `IMasterDataQueryService` vs `IMasterDataLookupService`

**Affected Units**: warehouse, transactions
**Category**: Integration
**Description**: Both units mock the same Master Data lookup capability but use different DI token names and interface definitions:
- **warehouse** uses token `'IMasterDataQueryService'` with its own interface (`IMasterDataQueryService` in `libs/warehouse/feature/src/lib/mocks/interfaces/`)
- **transactions** uses token `'IMasterDataLookupService'` with the shared interface (`IMasterDataLookupService` in `libs/shared-types/src/interfaces/`)

When swapping mocks for the real `MasterDataModule`, the real module can only export one token name. If it exports `'IMasterDataLookupService'`, warehouse breaks. If it exports both, it's confusing duplication.

Additionally, `IMasterDataLookupService` exists in `libs/shared-types/` but is **not exported** from the package's `index.ts` — meaning it's technically unreachable via the `@autoflow/shared-types` import path.

**Impact**: Integration linking (mock → real swap) will fail for one unit unless both token names are registered. The warehouse unit's interface is locally defined and may drift from the shared contract.

**Recommendation**: 
1. Export `IMasterDataLookupService` from `libs/shared-types/src/index.ts`
2. Warehouse should import and use `IMasterDataLookupService` from `@autoflow/shared-types` instead of its local `IMasterDataQueryService`
3. Rename warehouse DI token from `'IMasterDataQueryService'` → `'IMasterDataLookupService'`
4. Update `MockMasterDataQueryService` to implement the shared interface

**Alternatives**: Register both token names in the real `MasterDataModule` (not recommended — creates confusion)

**Effort**: small (rename token, update imports, verify interface compatibility)

---

### 🟡 Major Issues

#### MJ-1: Warehouse Unit Missing Design Document

**Affected Units**: warehouse
**Category**: Architectural
**Description**: The warehouse unit has a `tasks.md` with implementation tasks (all marked complete) but no `design.md` document. The design was apparently deleted during the merge (the file existed on the merge branch but was removed by team1's branch). The tasks reference a `design.md` for architecture, components, data model, API spec, and correctness properties, but this document is no longer in the repository.

**Impact**: No authoritative design reference for the warehouse unit. Future developers or reviewers cannot verify implementation against design intent. The architecture review itself is limited because warehouse design decisions are only inferrable from implementation code and tasks.

**Recommendation**: Restore or recreate `design.md` for the warehouse unit at `.kiro/specs/autoflow-warehouse/design.md`. It should document the 5 components, 6 entities, 14 endpoints, and 9 PBT properties referenced in `tasks.md`.

**Alternatives**: Accept that the implementation IS the design (not recommended for a team project)

**Effort**: medium (document existing implementation)

---

#### MJ-2: Warehouse Mock Interface Not in Shared Types — Drift Risk

**Affected Units**: warehouse, master-data
**Category**: Integration
**Description**: The warehouse unit defines its own mock interfaces locally:
- `IMockTxLogService` (in `libs/warehouse/feature/src/lib/mocks/interfaces/`)
- `IMockMaService`
- `IMockStockValidationService`
- `IMockPeriodService`
- `IMasterDataQueryService`

These are separate from the shared interfaces in `libs/shared-types/`. While the DI tokens use the same string names (e.g., `'ITxLogService'`), the actual TypeScript interfaces may have drifted from the shared contracts.

In contrast, the transactions unit correctly imports and implements the shared interfaces from `@autoflow/shared-types`.

**Impact**: When linking warehouse to real Master Data services, type mismatches may surface at compile time or worse — at runtime if method signatures differ subtly (e.g., different parameter order, missing optional params).

**Recommendation**: Warehouse mock services should implement the shared interfaces from `@autoflow/shared-types` (like transactions does). Remove local interface definitions and import from the shared library.

**Alternatives**: Add CI contract tests that verify mock implementations match shared interface signatures

**Effort**: small (update imports, verify type compatibility, fix any mismatches)

---

#### MJ-3: `ApArStatus` Enum Defined in Both Prisma Schema Locations

**Affected Units**: master-data, transactions
**Category**: Duplication
**Description**: The merged Prisma schema defines `ApArStatus` enum in the `transactions` schema. However, the master-data unit's `TxLog` model (also in `transactions` schema) uses `ApArStatus` for the `ap_ar_status` field. This is correct — they share the same enum.

But the transactions unit's design document defines `ApArStatus` as a local enum AND references it from `shared-types`. The actual Prisma schema has it only once (in `transactions` schema), which is correct. However, the `ClearingStatus` enum is defined in the Prisma schema under `transactions` schema but is only used by the `GrIrClearing` model which is also in `transactions` schema — this is fine.

The real issue: `JOStatus` enum is defined in Prisma under `@@schema("transactions")` but the transactions unit's data model document shows it as a local enum. If master-data's `TxLog` ever needs to reference JO status (e.g., for ref chain validation), there's no shared access pattern defined.

**Impact**: Low immediate impact since enums are correctly placed in Prisma. But the lack of a clear "enum ownership" convention could cause confusion when adding new enums or when units need cross-schema enum access.

**Recommendation**: Document enum ownership in foundation conventions:
- `Role` → master_data schema (owned by master-data unit)
- `TxType`, `TxStatus`, `VatType`, `ApArStatus` → transactions schema (shared, owned by master-data as TX engine owner)
- `JOStatus`, `ClearingStatus` → transactions schema (owned by transactions unit)
- `CountSessionStatus`, `TransferStatus`, `WriteOffStatus` → warehouse schema (owned by warehouse unit)

**Effort**: trivial (documentation only)

---

#### MJ-4: Transactions Unit Missing from `app.module.ts` Registration

**Affected Units**: transactions
**Category**: Integration
**Description**: The merged `apps/api/src/app.module.ts` imports `WarehouseModule` and `MasterDataModule` but does NOT import `TransactionsModule`. The transactions unit has a fully implemented module (`libs/transactions/feature/src/transactions.module.ts`) with controllers and services, but it's not registered in the API application.

**Impact**: All 19 transactions endpoints are unreachable. The transactions unit's backend is effectively dead code until registered.

**Recommendation**: Add `TransactionsModule` import to `apps/api/src/app.module.ts`:
```typescript
import { TransactionsModule } from '@autoflow/transactions-feature';
// ... in imports array:
TransactionsModule,
```
Also add the path alias `@autoflow/transactions-feature` to `tsconfig.base.json`.

**Effort**: trivial (add import + path alias)

---

### 🟢 Minor Issues

#### MN-1: API URL Pattern Inconsistency — Module Prefix

**Affected Units**: master-data, transactions, warehouse
**Category**: Architectural
**Description**: Different URL prefix strategies:
- **master-data**: No module prefix — endpoints at `/api/v1/items`, `/api/v1/tx`, `/api/v1/warehouses`
- **transactions**: Module prefix — endpoints at `/api/v1/transactions/job-orders`, `/api/v1/transactions/ar/payments`
- **warehouse**: Module prefix — endpoints at `/api/v1/warehouse/count-sessions`, `/api/v1/warehouse/transfers`

**Impact**: Minor inconsistency. The master-data endpoints are "top-level" while other units are namespaced. This works fine functionally but creates a non-uniform API surface for frontend developers.

**Recommendation**: Accept as-is. Master data entities (items, warehouses, vendors, customers) are foundational and arguably deserve top-level paths. The module-prefixed pattern for domain operations (transactions, warehouse) provides clear grouping. Document this as an intentional convention.

**Effort**: N/A (accept as convention)

---

#### MN-2: Frontend Form Strategy Mismatch

**Affected Units**: master-data, transactions
**Category**: Technology
**Description**: 
- **master-data** design specifies Angular Material + Signals + Services (no specific form strategy mentioned in design, implementation uses standard reactive patterns)
- **transactions** design explicitly specifies Template-driven forms with custom validator directives (D3-8)

Both approaches work in Angular, but mixing them in the same app means developers need to context-switch between patterns.

**Impact**: Minor developer experience issue. No runtime conflict. Both patterns coexist fine in Angular.

**Recommendation**: Accept as-is for now. Each team chose what works for their domain complexity. Document the convention per unit so new developers know which pattern to follow in each area.

**Effort**: N/A (accept as team choice)

---

#### MN-3: Warehouse `tsconfig.base.json` Path Aliases Missing `@autoflow/transactions-*`

**Affected Units**: transactions
**Category**: Technology
**Description**: The merged `tsconfig.base.json` includes path aliases for `@autoflow/warehouse-*` and `@autoflow/master-data-*` but not for `@autoflow/transactions-*` libraries (`libs/transactions/data-access`, `libs/transactions/feature`, `libs/transactions/ui`).

**Impact**: TypeScript compilation will fail if any file tries to import from `@autoflow/transactions-*` paths. The transactions module cannot be properly imported by the API app.

**Recommendation**: Add path aliases to `tsconfig.base.json`:
```json
"@autoflow/transactions-data-access": ["libs/transactions/data-access/src/index.ts"],
"@autoflow/transactions-feature": ["libs/transactions/feature/src/index.ts"],
"@autoflow/transactions-ui": ["libs/transactions/ui/src/index.ts"]
```

**Effort**: trivial

---

## Recommendations

### Immediate Actions (Before Implementation)

1. **Fix CR-1** — Standardize pagination format across all units. Adopt `{ data, pagination: { page, limit, total, totalPages } }` with `?page=1&limit=20` query params. Master-data unit needs to rename `pageSize` → `limit`.
2. **Fix CR-2** — Export `IMasterDataLookupService` from `@autoflow/shared-types`. Warehouse unit should use this shared interface instead of its local `IMasterDataQueryService`. Align DI token names.
3. **Fix MJ-4** — Register `TransactionsModule` in `app.module.ts` and add missing `@autoflow/transactions-*` path aliases (also fixes MN-3).

### Design Refinements (Should Do)

4. **Fix MJ-1** — Restore or recreate warehouse `design.md` for documentation completeness.
5. **Fix MJ-2** — Warehouse mock services should implement shared interfaces from `@autoflow/shared-types` to prevent contract drift.
6. **Fix MJ-3** — Document enum ownership convention in foundation/steering files.

### Consolidation Opportunities (Nice to Have)

7. **MN-1** — Document the URL prefix convention (top-level for master data, module-prefixed for domain operations).
8. **MN-2** — Document per-unit form strategy choice for developer onboarding.

---

## Conclusion

**Go/No-Go**: Conditional Go — resolve critical issues first

The three units are architecturally well-aligned on the fundamentals: same stack (NestJS + Angular + Prisma + PostgreSQL), same auth pattern (JWT + RBAC with Guards), same DI-based mock strategy for inter-unit dependencies, and same testing approach (Jest + PBT with fast-check). The shared interfaces in `libs/shared-types/` provide a solid contract foundation.

However, two critical issues must be resolved before proceeding to further implementation:

1. **CR-1 (Pagination format)** — The frontend cannot build shared table/list components without a consistent API response shape. This affects every list endpoint across all 3 units.
2. **CR-2 (DI token naming)** — The mock-to-real swap (linking task) will fail for the warehouse unit unless token names are aligned with the shared contract.

Additionally, **MJ-4** (TransactionsModule not registered) is a trivial fix that unblocks the transactions unit's endpoints entirely.
