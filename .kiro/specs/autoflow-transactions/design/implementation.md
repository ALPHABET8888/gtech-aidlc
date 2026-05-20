# Implementation Specifications — Unit: transactions (ข้อมูลพื้นฐาน)

## Code Organization

**Architecture Pattern**: Domain-based services within Modular Monolith (D3-1)
**Repository**: Monorepo with Nx (Foundation DF-2)
**Unit Location**: `libs/transactions/`

### Directory Structure

```
libs/transactions/
├── data-access/
│   └── src/
│       ├── index.ts                          # Public exports
│       ├── prisma/
│       │   └── transactions.repository.ts    # Prisma queries for transactions schema
│       └── repositories/
│           ├── job-order.repository.ts
│           ├── ap-open-item.repository.ts
│           ├── ar-open-item.repository.ts
│           └── gr-ir-clearing.repository.ts
├── feature/
│   └── src/
│       ├── index.ts                          # Public exports
│       ├── transactions.module.ts            # Main NestJS module
│       ├── sales/
│       │   ├── sales.controller.ts
│       │   ├── sales.service.ts
│       │   ├── job-order.service.ts
│       │   ├── invoice.service.ts
│       │   ├── sales-cn.service.ts
│       │   └── dto/
│       │       ├── create-job-order.dto.ts
│       │       ├── update-jo-status.dto.ts
│       │       ├── issue-temp-do.dto.ts
│       │       ├── issue-invoice.dto.ts
│       │       ├── create-sales-return.dto.ts
│       │       └── create-sales-price-adj.dto.ts
│       ├── purchasing/
│       │   ├── purchasing.controller.ts
│       │   ├── purchasing.service.ts
│       │   ├── goods-receipt.service.ts
│       │   ├── purchase-cn.service.ts
│       │   ├── gr-ir-clearing.service.ts
│       │   └── dto/
│       │       ├── create-goods-receipt.dto.ts
│       │       ├── create-goods-return.dto.ts
│       │       ├── create-gr-replacement.dto.ts
│       │       ├── create-cn-return.dto.ts
│       │       ├── create-cn-price-adj.dto.ts
│       │       └── create-cn-debt.dto.ts
│       ├── ap-ar/
│       │   ├── ap-ar.controller.ts
│       │   ├── ap.service.ts
│       │   ├── ar.service.ts
│       │   ├── payment-matching.service.ts
│       │   └── dto/
│       │       ├── make-ap-payment.dto.ts
│       │       ├── receive-ar-payment.dto.ts
│       │       └── payment-allocation.dto.ts
│       ├── mocks/
│       │   ├── master-data-mock.module.ts
│       │   ├── mock-tx-log.service.ts
│       │   ├── mock-ma-calculation.service.ts
│       │   ├── mock-stock-validation.service.ts
│       │   ├── mock-period.service.ts
│       │   ├── mock-ref-chain.service.ts
│       │   ├── mock-master-data-lookup.service.ts
│       │   ├── mock-data/
│       │   │   ├── items.json
│       │   │   ├── vendors.json
│       │   │   ├── customers.json
│       │   │   └── warehouses.json
│       │   └── README.md
│       └── exceptions/
│           ├── jo-not-done.exception.ts
│           ├── duplicate-temp-do.exception.ts
│           ├── duplicate-invoice.exception.ts
│           ├── return-qty-exceeded.exception.ts
│           ├── gr-already-returned.exception.ts
│           ├── cn-return-inventory.exception.ts
│           ├── clearing-not-open.exception.ts
│           ├── payment-exceeds-balance.exception.ts
│           └── open-item-not-found.exception.ts
└── ui/
    └── src/
        ├── index.ts
        ├── transactions.routes.ts
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
        ├── components/
        │   ├── tx-form-base.component.ts
        │   ├── payment-allocation.component.ts
        │   └── open-item-selector.component.ts
        ├── services/
        │   ├── transactions-api.service.ts
        │   └── transactions-state.service.ts
        ├── validators/
        │   ├── ref-chain.validator.ts
        │   ├── qty-positive.validator.ts
        │   └── period-open.validator.ts
        └── models/
            └── index.ts

tests/
├── unit/
│   ├── sales.service.spec.ts
│   ├── job-order.service.spec.ts
│   ├── purchasing.service.spec.ts
│   ├── gr-ir-clearing.service.spec.ts
│   ├── ap.service.spec.ts
│   ├── ar.service.spec.ts
│   └── payment-matching.service.spec.ts
├── integration/
│   ├── sales.integration.spec.ts
│   ├── purchasing.integration.spec.ts
│   └── ap-ar.integration.spec.ts
├── properties/
│   ├── ap-ar-lifecycle.properties.spec.ts
│   ├── payment-matching.properties.spec.ts
│   ├── jo-state-machine.properties.spec.ts
│   └── clearing-lifecycle.properties.spec.ts
└── e2e/
    ├── job-order-flow.e2e.spec.ts
    ├── sales-path-a.e2e.spec.ts
    ├── sales-path-b.e2e.spec.ts
    └── purchasing-flow.e2e.spec.ts
```

### Module Boundaries
- Controllers: HTTP request handling + validation only — no business logic
- Services: Business logic orchestration — call mock services + repositories
- Repositories: Prisma queries — data access only
- Mocks: Implement shared interfaces — configurable for testing
- Exceptions: Domain-specific errors extending DomainException

### Naming Conventions
- **Files**: kebab-case (`job-order.service.ts`)
- **Classes**: PascalCase (`JobOrderService`)
- **Functions**: camelCase (`createJobOrder()`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_ALLOCATION_ITEMS`)
- **DB tables**: snake_case (`job_order`, `ap_open_item`)
- **DTOs**: PascalCase with Dto suffix (`CreateJobOrderDto`)

---

## Technology Stack

### Dependencies (added to root package.json)
```json
{
  "dependencies": {
    "fast-check": "^3.x"
  }
}
```

Note: Most dependencies (NestJS, Prisma, Angular, Jest, etc.) are already in the monorepo from Foundation.

### Nx Library Configuration
```
nx generate @nx/nest:library transactions-data-access --directory=libs/transactions/data-access
nx generate @nx/nest:library transactions-feature --directory=libs/transactions/feature
nx generate @nx/angular:library transactions-ui --directory=libs/transactions/ui --lazy --routing
```

---

## Development Setup

### Prerequisites
- Node.js 20+
- npm
- PostgreSQL 15+ (via Docker Compose from Foundation)
- Nx CLI (`npx nx`)

### Setup Commands
```bash
# From monorepo root (already set up by Foundation)
npm install

# Add fast-check for PBT
npm install fast-check --save-dev

# Generate Prisma client with transactions schema
npx prisma generate

# Run migrations (adds transactions schema tables)
npx prisma migrate dev --name add-transactions-schema

# Start dev server
npx nx serve api
npx nx serve web
```

### Environment Variables
| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection | postgresql://user:pass@localhost:5432/autoflow |
| JWT_SECRET | Auth token secret | (from Foundation) |
| MOCK_DATA_PATH | Path to mock JSON fixtures | libs/transactions/feature/src/mocks/mock-data |

---

## Testing

**Unit Tests**: Jest — `npx nx test transactions-feature`
**Integration Tests**: Jest + Supertest — `npx nx test transactions-feature --testPathPattern=integration`
**PBT**: Jest + fast-check — `npx nx test transactions-feature --testPathPattern=properties`
**E2E Tests**: Playwright — `npx nx e2e transactions-e2e`

**Coverage Target**: 80% (services), 90% (business logic with PBT)

### Test Database
- Integration tests use separate test DB (same schema, different data)
- `docker-compose.test.yml` provides isolated PostgreSQL for CI
- Each test suite runs in transaction that rolls back (Prisma `$transaction`)

---

## Module Registration

```typescript
// apps/api/src/app.module.ts — add TransactionsModule
@Module({
  imports: [
    // ... existing modules
    TransactionsModule,
  ],
})
export class AppModule {}

// apps/web/src/app.routes.ts — add lazy route
export const appRoutes: Routes = [
  // ... existing routes
  {
    path: 'transactions',
    loadChildren: () => import('@autoflow/transactions/ui').then(m => m.transactionsRoutes),
  },
];
```
