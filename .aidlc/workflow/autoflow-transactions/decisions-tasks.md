# Tasks Decisions — Unit: transactions (ข้อมูลพื้นฐาน)

## Context Summary
- **Unit**: transactions (ข้อมูลพื้นฐาน — Sales & Purchasing)
- **Design**: 5 components, 6 entities, 19 endpoints, 6 integrations (mocked), 8 PBT properties
- **Stories**: 16 (US-008 to US-021, US-026, US-027)
- **Stack**: NestJS + Prisma + Angular (Signals + Template-driven)
- **Mock Strategy**: Interface + Mock via DI (swap to real later)
- **Testing**: Jest + Supertest + fast-check + Playwright

---

## Decision Questions

### D4-1: Task Breakdown Strategy
**Question**: ควรแบ่ง tasks อย่างไรสำหรับ 16 stories ที่ครอบคลุม Sales, Purchasing, AP/AR?
- 1) Component-first — สร้าง infrastructure (mock, schema, module) ก่อน แล้วค่อยสร้าง features ทีละ domain **(Recommended)**
- 2) Vertical slice — สร้างทีละ flow ครบ (JO → Invoice → AR) end-to-end
- 3) Layer-by-layer — สร้าง data layer ทั้งหมดก่อน แล้ว service layer แล้ว controller
- 4) Other (please specify): _______

**Answer**: 
2
---

### D4-2: Implementation Approach
**Question**: ควรเขียน tests อย่างไรระหว่าง implement?
- 1) Test-after — implement ก่อน แล้วเขียน tests ตาม (เร็วกว่า, เหมาะกับ mock-heavy code) **(Recommended)**
- 2) TDD — เขียน test ก่อน implement (strict, ช้ากว่า)
- 3) Outside-in — เริ่มจาก E2E/integration test แล้ว implement ให้ pass
- 4) Other (please specify): _______

**Answer**: 
1
---

### D4-3: Component Priority
**Question**: ควรสร้าง component ไหนก่อน?
- 1) Mock layer → Data layer → Sales → Purchasing → AP/AR **(Recommended)**
- 2) Data layer → Mock layer → AP/AR → Sales → Purchasing
- 3) Sales (highest story count) → Purchasing → AP/AR → Mock layer
- 4) Other (please specify): _______

**Answer**: 
1
---

### D4-4: Task Granularity
**Question**: ขนาด task ควรเป็นอย่างไร?
- 1) Standard (1-2 days per task) — เหมาะกับ team ที่ track progress **(Recommended)**
- 2) Fine-grained (2-4 hours per task) — เหมาะกับ AI agent execution
- 3) Coarse (3-5 days per task) — เหมาะกับ experienced devs
- 4) Other (please specify): _______

**Answer**: 
1
---

### D4-5: Frontend Tasks Inclusion
**Question**: ควรรวม Angular frontend tasks ใน phase นี้หรือแยก?
- 1) Include — สร้าง frontend pages + services ใน phase เดียวกับ backend **(Recommended)**
- 2) Backend-first — สร้าง backend ให้เสร็จก่อน แล้วค่อยทำ frontend ทีหลัง
- 3) Parallel — แยก frontend/backend เป็น parallel waves
- 4) Other (please specify): _______

**Answer**: 
1
---

### D4-6: PBT Tasks Placement
**Question**: Property-based tests (8 properties) ควรอยู่ตรงไหนใน task sequence?
- 1) After service implementation — เขียน PBT หลังจาก service logic เสร็จ **(Recommended)**
- 2) Together with service — เขียน PBT พร้อมกับ service ใน task เดียวกัน
- 3) Separate phase — รวม PBT ทั้งหมดเป็น phase สุดท้าย
- 4) Other (please specify): _______

**Answer**: 
1
---

### D4-7: Estimates
**Question**: ควรใส่ estimates ใน tasks หรือไม่?
- 1) T-shirt sizes (S/M/L/XL) — quick estimation **(Recommended)**
- 2) Hours — precise estimation
- 3) No estimates — ไม่ต้อง, ดูจาก task count เพียงพอ
- 4) Other (please specify): _______

**Answer**: 
1
---

## Decisions Summary
<!-- Machine-readable compact summary. Downstream phases: read ONLY this section. -->
- D4-1 Breakdown: Vertical slice (end-to-end flows) with infrastructure-first prerequisite
- D4-2 Testing Approach: Test-after (implement first, write tests after)
- D4-3 Priority: Mock layer → Data layer → Sales → Purchasing → AP/AR
- D4-4 Granularity: Standard (1-2 days per task)
- D4-5 Frontend: Include with backend (same phase)
- D4-6 PBT Placement: After service implementation (separate tasks)
- D4-7 Estimates: T-shirt sizes (S/M/L/XL)

---

**Instructions**: Fill in your answers above and respond with "done"
