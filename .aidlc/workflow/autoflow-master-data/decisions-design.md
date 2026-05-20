# Design Decisions — Unit: master-data (ข้อมูลหลัก)

## Context Summary
- **Unit**: master-data — Core TX Engine, Moving Average, Stock Validation, Period Lock, VOID, Master Data CRUD
- **Stories**: 7 (US-001 to US-007) — all Core TX Engine & Stock Management
- **Stack**: TypeScript / NestJS / PostgreSQL / Prisma (settled in Foundation)
- **Schema**: `master_data` schema in shared PostgreSQL DB
- **Role**: Upstream dependency for ALL other units — must be stable and fast
- **Constraint**: TX Log immutable, MA atomic, Stock never negative, Period Lock enforced
- **Team Context**: Unit 1 builds first; other teams depend on this unit's API
- **Note from user**: Use mockup API/JSON for dependencies from other teams; no linking to real external data yet

---

## Decision Questions

### D3-1: TX Log Data Model Pattern
**Question**: How should the immutable TX Log table be structured for 23+ TX types with varying fields?
- 1) Single wide table — one `tx_log` table with nullable columns for all TX-type-specific fields (simpler queries, some null bloat) **(Recommended)**
- 2) Shared header + detail tables — `tx_log` (common fields) + `tx_detail_sales`, `tx_detail_purchase`, etc. (normalized, more joins)
- 3) Single table + JSON column — `tx_log` with a `payload JSONB` for type-specific data (flexible, less type-safe)
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-2: Moving Average Concurrency Control
**Question**: How should concurrent MA calculations be protected (multiple TX for same item+warehouse at same time)?
- 1) Database-level row lock — `SELECT ... FOR UPDATE` on stock balance row during TX POST (reliable, simple) **(Recommended)**
- 2) Optimistic locking — version column on stock balance, retry on conflict (better throughput, retry logic)
- 3) Application-level queue — serialize all stock-affecting TX per item+warehouse (guaranteed order, bottleneck risk)
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-3: Stock Balance Storage
**Question**: How should current stock balance and MA be tracked per item+warehouse?
- 1) Dedicated `stock_balance` table — pre-computed current qty and MA per item+warehouse, updated on each TX POST (fast reads, must stay in sync) **(Recommended)**
- 2) Compute from TX Log — SUM all TX for item+warehouse on every read (always accurate, slow for large datasets)
- 3) Materialized view — PostgreSQL materialized view refreshed on TX POST (compromise, refresh latency)
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-4: Period Management Model
**Question**: How should accounting periods be modeled and enforced?
- 1) Period table with status — `period` table with `OPEN`/`CLOSED` status, checked on every POST **(Recommended)**
- 2) Configuration-based — store current open period in config, reject anything outside
- 3) Range-based — define valid date range, auto-close at end of range
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-5: Master Data CRUD Approach
**Question**: How should master data entities (Items, Warehouses, Vendors, Customers, Users) be managed via API?
- 1) Standard REST CRUD per entity — `/api/items`, `/api/warehouses`, `/api/vendors`, `/api/customers` with pagination, filtering, soft-delete **(Recommended)**
- 2) Generic CRUD endpoint — `/api/master-data/:entityType` with dynamic schema validation
- 3) Command-based — separate create/update/archive endpoints per entity
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-6: Approval Guard Implementation
**Question**: How should the role-based approval mechanism (DRAFT → POSTED) be implemented?
- 1) NestJS Guard + Decorator — `@RequiresApproval(Role.MANAGER)` decorator with custom Guard checking user role (clean, reusable) **(Recommended)**
- 2) Service-layer check — validation in each service method before status transition
- 3) Database trigger — PostgreSQL trigger checking role before status UPDATE
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-7: VOID Pattern — Reverse TX Generation
**Question**: How should the VOID operation generate the reverse transaction?
- 1) Service-layer mirror — VoidService reads original TX, creates new TX with negated values, updates original status in one DB transaction **(Recommended)**
- 2) Database function — PostgreSQL stored procedure handles VOID atomically
- 3) Event-driven — emit VoidRequested event, handler creates reverse TX asynchronously
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-8: Reference Chain Validation Strategy
**Question**: How should reference chain validation (e.g., CN must reference Invoice, GR_RETURN must reference GR_RECEIVE) be implemented?
- 1) Validation service with rule registry — `RefChainValidator` with configurable rules per TX type (extensible, testable) **(Recommended)**
- 2) Inline validation in each TX service — each TX type checks its own references
- 3) Database foreign keys + constraints — rely on DB to enforce referential integrity
- 4) Other (please specify): _______

**Answer**: 
1 (auto-filled — recommended)

---

### D3-9: Frontend UI Component Library
**Question**: Which UI component library should the Angular frontend use for master data screens (tables, forms, dialogs)?
- 1) Angular Material — official Google library, good integration, standard look **(Recommended)**
- 2) PrimeNG — rich component set, data tables optimized for enterprise
- 3) Ng-Zorro (Ant Design for Angular) — enterprise-focused, good for admin panels
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-10: Frontend State Management
**Question**: How should the Angular frontend manage state for master data and TX operations?
- 1) NgRx (Redux pattern) — predictable state, time-travel debugging, good for complex flows **(Recommended)**
- 2) Angular Signals + Services — lightweight, built-in Angular 16+, simpler mental model
- 3) Akita — entity-based state management, good for CRUD apps
- 4) Other (please specify): _______

**Answer**: 
2
---

### D3-11: Correctness & Property-Based Testing
**Question**: How should correctness properties be verified (MA calculation accuracy, stock non-negative invariant, immutability enforcement)?
- 1) Property-Based Testing with fast-check — define invariants as properties, generate random TX sequences to verify (thorough, catches edge cases) **(Recommended)**
- 2) Traditional unit tests only — manual test cases for known scenarios (faster to write, may miss edge cases)
- 3) Contract testing — define contracts for each TX type, verify input/output conformance
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-12: API Pagination & Filtering Pattern
**Question**: How should list endpoints (items, TX log, etc.) handle pagination and filtering?
- 1) Cursor-based pagination + query params — `?cursor=xxx&limit=20&filter[status]=POSTED` (good for large datasets, stable) **(Recommended)**
- 2) Offset-based pagination — `?page=1&pageSize=20` (simpler, can skip records on concurrent writes)
- 3) GraphQL-style connections — even for REST, use `first/after/last/before` pattern
- 4) Other (please specify): _______

**Answer**: 
2
---

## Decisions Summary
<!-- Machine-readable compact summary. Downstream agents: read ONLY this section. -->
<!-- Auto-populated after user fills answers above. One line per decision. -->
- D3-1 TX Log Model: Single wide table with nullable columns for all TX types
- D3-2 MA Concurrency: Database-level row lock (SELECT FOR UPDATE on stock_balance)
- D3-3 Stock Balance: Dedicated stock_balance table (pre-computed qty + MA per item+warehouse)
- D3-4 Period Model: Period table with OPEN/CLOSED status
- D3-5 Master CRUD: Standard REST CRUD per entity with pagination, filtering, soft-delete
- D3-6 Approval Guard: NestJS Guard + Decorator (@RequiresApproval)
- D3-7 VOID Pattern: Service-layer mirror (VoidService in single DB transaction)
- D3-8 Ref Chain: Validation service with rule registry (RefChainValidator)
- D3-9 UI Library: Angular Material
- D3-10 State Mgmt: Angular Signals + Services
- D3-11 PBT: Property-Based Testing with fast-check
- D3-12 Pagination: Offset-based pagination (?page=1&pageSize=20)

---

**Instructions**: Fill in your answers above and respond with "done" or say "use recommendations" to auto-fill.
