# Design Decisions — Unit: transactions (ข้อมูลพื้นฐาน)

## Context Summary
- **Unit**: transactions (ข้อมูลพื้นฐาน — Transaction Operations: Sales & Purchasing)
- **Stories**: 16 (US-008 to US-021, US-026, US-027)
- **Scope**: Job Order dual-path, TEMP_DO, Invoice, Sales CN, AR Payment, GR, Return, Replacement, Purchase CN, AP Payment, AP/AR Open Item lifecycle
- **Dependencies**: ข้อมูลหลัก (Master Data) — TX Log, MA, Stock validation, Period check
- **Stack** (from Foundation): NestJS + Prisma + PostgreSQL (transactions schema) + Angular lazy-loaded module
- **Constraint**: ใช้ mockup API/JSON แทนข้อมูลจริงจากทีมอื่น — จะ link ทีหลัง

### Already Decided (Foundation)
- Repo: Monorepo with Nx
- Auth: JWT + RBAC (6 roles)
- Errors: NestJS HttpException + DomainException
- Comms: Direct module imports
- Database: Single DB, transactions schema
- ORM: Prisma
- API: REST + OpenAPI/Swagger
- Testing: Jest + Supertest + Playwright
- Frontend: Angular lazy-loaded feature module

---

## Decision Questions

### D3-1: Service Layer Architecture
**Question**: ภายใน transactions module ควรจัดโครงสร้าง service layer อย่างไร?
- 1) Domain-based services — แยกตาม domain (SalesService, PurchasingService, ApArService) **(Recommended)**
- 2) TX-type-based services — แยก service ต่อ TX type (TempDoService, InvoiceService, GrReceiveService, ...)
- 3) Use-case-based services — แยกตาม use case (CreateJobOrderUseCase, IssueInvoiceUseCase, ...)
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-2: Job Order State Machine
**Question**: Job Order มี state transitions (OPEN → IN_PROGRESS → DONE) ควรจัดการ state machine อย่างไร?
- 1) Simple enum + validation in service — ตรวจ state ใน service method ก่อน transition **(Recommended)**
- 2) State machine library (xstate/nestjs-state-machine) — formal state machine
- 3) Database trigger — ให้ DB enforce state transitions
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-3: AP/AR Open Item Matching Strategy
**Question**: การ match payment กับ open items (manual matching ตาม D1-6) ควร implement อย่างไร?
- 1) Payment allocation array — user ส่ง array ของ { openItemId, amount } มาใน request **(Recommended)**
- 2) FIFO auto-match — ระบบ match อัตโนมัติตามลำดับเวลา, user เลือก override ได้
- 3) Single-item match — 1 payment ต่อ 1 open item เท่านั้น
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-4: Master Data Dependency (Mockup Strategy)
**Question**: Unit นี้ต้องเรียก Master Data services (TX Log, MA, Stock, Period, Item lookup) — ในระหว่างพัฒนาจะ mock อย่างไร?
- 1) Interface + Mock implementation — สร้าง mock class ที่ implement shared interface, inject ผ่าน DI **(Recommended)**
- 2) JSON fixture files — อ่านจาก static JSON files สำหรับ test data
- 3) In-memory mock service — hardcode responses ใน mock service
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-5: GR/IR Clearing Account Pattern
**Question**: GR/IR Return Clearing (สร้างตอน GR_RETURN, ปิดตอน CN_RETURN หรือ GR_REPLACEMENT) ควร model อย่างไร?
- 1) Dedicated clearing table — `gr_ir_clearing` table ใน transactions schema พร้อม status tracking **(Recommended)**
- 2) Virtual balance — คำนวณจาก TX Log entries (sum of related TXs)
- 3) Field in GR_RETURN TX — เก็บ clearing balance เป็น field ใน TX record
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-6: VAT Handling
**Question**: VAT INPUT/OUTPUT ควรจัดการอย่างไรใน transactions unit?
- 1) VAT fields in TX Log — เก็บ vat_amount, vat_type ใน TX entry, คำนวณจาก base_amount × rate **(Recommended)**
- 2) Separate VAT table — แยก table สำหรับ VAT records
- 3) Computed at query time — ไม่เก็บ VAT, คำนวณตอน query
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-7: Frontend State Management
**Question**: Angular feature module สำหรับ transactions ควรจัดการ state อย่างไร?
- 1) NgRx (Redux pattern) — formal store สำหรับ complex state (JO list, AP/AR items) **(Recommended)**
- 2) RxJS services — BehaviorSubject/Observable ใน services, ไม่ใช้ store library
- 3) Signal-based state — Angular Signals + computed signals
- 4) Other (please specify): _______

**Answer**: 
3
---

### D3-8: Form Handling (Complex TX Forms)
**Question**: TX forms (Job Order, Invoice, GR, CN) มีหลาย fields และ validation rules — ควรจัดการ forms อย่างไร?
- 1) Reactive Forms + custom validators — Angular Reactive Forms พร้อม custom validator functions **(Recommended)**
- 2) Template-driven forms — simple ngModel binding
- 3) Dynamic form builder — generate forms from config/schema
- 4) Other (please specify): _______

**Answer**: 
2
---

### D3-9: Correctness & Property-Based Testing
**Question**: สำหรับ business rules ที่ซับซ้อน (MA calculation, stock validation, reference chain, AP/AR lifecycle) ควรใช้ property-based testing หรือไม่?
- 1) Yes — ใช้ fast-check สำหรับ core business rules (MA invariants, stock never negative, AP/AR lifecycle) **(Recommended)**
- 2) No — ใช้ example-based tests เท่านั้น (sufficient สำหรับ scope นี้)
- 3) Partial — ใช้ PBT เฉพาะ MA calculation, ที่เหลือ example-based
- 4) Other (please specify): _______

**Answer**: 
1
---

### D3-10: API Pagination & Filtering
**Question**: List endpoints (Job Orders, AP items, AR items, TX history) ควรจัดการ pagination อย่างไร?
- 1) Cursor-based pagination — ใช้ cursor (last ID) สำหรับ performance กับ large datasets **(Recommended)**
- 2) Offset-based pagination — ใช้ page/limit (simple, familiar)
- 3) Hybrid — cursor สำหรับ TX history, offset สำหรับ master lists
- 4) Other (please specify): _______

**Answer**: 
2
---

## Decisions Summary
<!-- Machine-readable compact summary. Downstream agents: read ONLY this section. -->
- D3-1 Service Architecture: Domain-based services (SalesService, PurchasingService, ApArService)
- D3-2 JO State Machine: Simple enum + validation in service
- D3-3 AP/AR Matching: Payment allocation array ({ openItemId, amount }[])
- D3-4 Mock Strategy: Interface + Mock implementation via DI
- D3-5 GR/IR Clearing: Dedicated clearing table (gr_ir_clearing) with status tracking
- D3-6 VAT Handling: VAT fields in TX Log (vat_amount, vat_type, computed from base_amount × rate)
- D3-7 Frontend State: Angular Signals + computed signals
- D3-8 Form Handling: Template-driven forms (ngModel) with custom directives for complex validation
- D3-9 PBT: Yes — fast-check for core business rules (MA invariants, stock never negative, AP/AR lifecycle)
- D3-10 Pagination: Offset-based (page/limit)

### Validation Notes
- D3-8 flagged (Medium): Template-driven forms with complex TX validation — user confirmed "keep". Will use custom validator directives for cross-field and conditional validation.

---

**Instructions**: Fill in your answers above and respond with "done"
