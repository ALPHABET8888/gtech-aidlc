# Tasks Decisions — Unit: master-data (ข้อมูลหลัก)

## Context Summary
- **Unit**: master-data — Core TX Engine, MA, Stock, Period, VOID, Approval, RefChain, Master Data CRUD 
- **Design**: 9 components, 10 entities, 28 endpoints, 8 correctness properties
- **Stack**: NestJS / Prisma / PostgreSQL / Angular (Signals + Material) / fast-check
- **Architecture**: Modular Monolith (NestJS module with exported services)
- **Team**: Team 1 — builds first, other teams depend on this unit's API
- **Constraint**: Self-contained — use mock/seed data, no linking to real external data

---

## Decision Questions

### D4-1: Task Breakdown Strategy
**Question**: How should the 9 components + 10 entities + 28 endpoints be broken into implementation tasks?
- 1) Layer-by-layer — Data layer first (Prisma schema), then services, then controllers, then UI (clear dependencies) **(Recommended)**
- 2) Vertical slice — Implement one feature end-to-end (e.g., Item CRUD from DB to UI) before moving to next
- 3) Component-first — Build each service component independently, then wire together
- 4) Other (please specify): _______

**Answer**: 
2
---

### D4-2: Implementation Approach
**Question**: How should code and tests be written for this core engine unit?
- 1) Test-first for core logic — Write PBT properties + unit tests for TX Engine/MA/Stock first, then implement to pass (ensures correctness) **(Recommended)**
- 2) Test-after — Write implementation first, add tests after each component is working
- 3) Full TDD — Red-Green-Refactor cycle for everything including CRUD
- 4) Other (please specify): _______

**Answer**: 
2
---

### D4-3: Component Priority
**Question**: Which components should be built first? (Other units depend on TX Engine services)
- 1) Core engine first → CRUD second → UI last — TxLogService, MA, Stock, Period first (unblocks other teams fastest) **(Recommended)**
- 2) CRUD first → Engine second — Master data CRUD is simpler, warm up before complex engine
- 3) Simultaneous — Data layer for all, then services for all, then controllers for all
- 4) Other (please specify): _______

**Answer**: 
1
---

### D4-4: Integration Strategy
**Question**: How should downstream unit integration be handled during development?
- 1) Mock-first — Export service interfaces with mock implementations, other teams can integrate against mocks immediately **(Recommended)**
- 2) Contract-first — Define OpenAPI spec first, implement after
- 3) Real-only — Build real services, other teams wait until ready
- 4) Other (please specify): _______

**Answer**: 
2
---

### D4-5: Testing Strategy
**Question**: What level of testing should each task include?
- 1) Unit + Integration — Jest unit tests for services, Supertest integration for API endpoints (balanced) **(Recommended)**
- 2) Unit only — Jest unit tests, defer integration tests
- 3) Full pyramid — Unit + Integration + E2E (Playwright) for each feature
- 4) Other (please specify): _______

**Answer**: 
2
---

### D4-6: Task Granularity
**Question**: How large should individual tasks be?
- 1) Standard (1-2 days) — Each task is a meaningful, testable unit of work **(Recommended)**
- 2) Fine-grained (2-4 hours) — Very small tasks, more checkpoints
- 3) Coarse (3-5 days) — Larger chunks, fewer tasks
- 4) Other (please specify): _______

**Answer**: 
1
---

### D4-7: Database Schema Strategy
**Question**: How should the Prisma schema be handled?
- 1) Schema first — Create full Prisma schema + migration as first task, before any services **(Recommended)**
- 2) Incremental schema — Add tables as needed per component
- 3) Schema + seed together — Schema + seed data + migration scripts in one task
- 4) Other (please specify): _______

**Answer**: 
2
---

### D4-8: Frontend Priority
**Question**: When should the Angular UI module be built relative to the backend?
- 1) Backend-first — Complete all API endpoints, then build UI (UI can use real API) **(Recommended)**
- 2) Parallel — Build UI in parallel using mock API responses
- 3) UI-first — Build UI with mock data, wire to backend later
- 4) Other (please specify): _______

**Answer**: 
1
---

## Decisions Summary
<!-- Machine-readable compact summary. Downstream agents: read ONLY this section. -->
<!-- Auto-populated after user fills answers above. One line per decision. -->
- D4-1 Strategy: Vertical slice — implement one feature end-to-end before moving to next
- D4-2 Approach: Test-after — write implementation first, add tests after each component
- D4-3 Priority: Core engine first → CRUD second → UI last
- D4-4 Integration: Mock-first — export interfaces with mock implementations (auto-filled — recommended)
- D4-5 Testing: Unit only — Jest unit tests, defer integration tests
- D4-6 Granularity: Standard (1-2 days per task)
- D4-7 Schema: Incremental — add tables as needed per component
- D4-8 Frontend: Backend-first — complete API endpoints, then build UI

---

**Instructions**: Fill in your answers above and respond with "done" or say "use recommendations" to auto-fill.
