# Design Document: autoflow-transactions (ข้อมูลพื้นฐาน — Transaction Operations)

## Summary
- **Architecture**: Modular Monolith — Domain-based services within NestJS module
- **Stack**: Angular (Signals + Template-driven) / NestJS (Domain services) / PostgreSQL (transactions schema) / Prisma
- **Components**: 5 — SalesService, PurchasingService, ApArService, IMasterDataMockService, TransactionsFeatureModule (Angular)
- **Entities**: 6 — JobOrder, APOpenItem, AROpenItem, APPaymentAllocation, ARPaymentAllocation, GrIrClearing
- **Endpoints**: 19 — REST with OpenAPI/Swagger, offset-based pagination
- **Integrations**: Master Data (mocked via DI — swap to real later)
- **Testing**: PBT Yes (fast-check, 8 properties) — NFR Skipped
- **Key Decisions**: Domain-based services (D3-1), Mock via DI for Master Data (D3-4), Dedicated GR/IR clearing table (D3-5)

## Architecture

### System Context Diagram
```
┌─────────────────────────────────────────────────────────────────────┐
│                         Angular Frontend                              │
│   [JO Pages] [Sales Pages] [Purchasing Pages] [AP/AR Pages]         │
│   State: Signals (D3-7) | Forms: Template-driven (D3-8)            │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTP REST
┌────────────────────────────────┼────────────────────────────────────┐
│                         NestJS Backend                                │
│                                │                                     │
│   ┌────────────┐  ┌───────────┴──────┐  ┌────────────┐            │
│   │   Sales    │  │   Purchasing     │  │   AP/AR    │            │
│   │  Service   │  │    Service       │  │  Service   │            │
│   └─────┬──────┘  └────────┬─────────┘  └─────┬──────┘            │
│         │                   │                   │                    │
│         └───────────────────┼───────────────────┘                   │
│                             │                                        │
│              ┌──────────────┴──────────────┐                        │
│              │  IMasterDataMockService (DI) │  ← swap to real later │
│              │  TX Log | MA | Stock | Period│                        │
│              └──────────────┬──────────────┘                        │
│                             │                                        │
│              ┌──────────────┴──────────────┐                        │
│              │  Prisma (transactions schema)│                        │
│              └─────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Technology Stack
- **Frontend**: Angular 17+ (Signals state, Template-driven forms, lazy-loaded module)
- **Backend**: NestJS (Domain-based services, class-validator DTOs)
- **Database**: PostgreSQL — `transactions` schema (JobOrder, AP/AR, Clearing)
- **ORM**: Prisma (schema-first, multi-schema)
- **Testing**: Jest + Supertest + fast-check (PBT) + Playwright
- **Key Libraries**: fast-check (PBT), class-validator, @nestjs/swagger

### Key Design Decisions
1. **Domain-based services** (D3-1): SalesService, PurchasingService, ApArService — clear domain boundaries
2. **Mock via DI** (D3-4): Master Data dependency mocked with interface + mock class, swap module import to link later
3. **Dedicated clearing table** (D3-5): `gr_ir_clearing` table tracks GR/IR Return Clearing lifecycle with status + PPV
4. **Signal-based state** (D3-7): Angular Signals + computed signals for reactive UI state
5. **PBT for business rules** (D3-9): 8 correctness properties covering AP/AR lifecycle, payment matching, JO state machine, clearing, invoice path

## Open Questions & Risks

| # | Question/Risk | Impact | Status |
|---|--------------|--------|--------|
| 1 | Mock accuracy — mock MA/stock behavior อาจไม่ตรงกับ real implementation | Medium | Mitigated (shared interface contract) |
| 2 | Template-driven forms complexity — complex validation อาจยากกว่า Reactive Forms | Low | Accepted (use custom directives) |
| 3 | Prisma multi-schema migration conflicts — ถ้า Team 1 เปลี่ยน master_data schema | Medium | Mitigated (separate schemas, PR review) |
| 4 | Linking task scope — swap mock → real อาจต้อง refactor ถ้า interface เปลี่ยน | Low | Mitigated (interface in shared-types) |

## Detailed Specifications

- [Components](design/components.md) — SalesService, PurchasingService, ApArService, Mock layer, Angular module
- [Data Model](design/data-model.md) — JobOrder, AP/AR Open Items, Payment Allocations, GR/IR Clearing
- [API Specification](design/api-spec.md) — 19 REST endpoints with request/response schemas
- [Integration](design/integration.md) — Master Data mock strategy, DI swap pattern, linking plan
- [Implementation](design/implementation.md) — Directory structure, Nx libraries, dev setup, testing
- [Correctness Properties](design/correctness.md) — 8 PBT properties (fast-check)
