# Correctness Properties — Unit: transactions (ข้อมูลพื้นฐาน)

## Overview
**PBT Framework**: fast-check (TypeScript)
**Scope**: Core business rules ที่ต้อง hold เสมอ — AP/AR lifecycle, payment matching, JO state machine, GR/IR clearing

---

## Properties

### Property 1: AP/AR Open Item Balance Invariant

**Validates**: US-026, US-027
**Property**: สำหรับ open item ใดๆ, `remainingAmount` ต้องเท่ากับ `originalAmount - sum(allocations) - sum(cnReductions)` เสมอ

```typescript
fc.assert(fc.property(
  fc.record({
    originalAmount: fc.float({ min: 0.01, max: 1000000, noNaN: true }),
    payments: fc.array(fc.float({ min: 0.01, max: 100000, noNaN: true }), { maxLength: 10 }),
    cnReductions: fc.array(fc.float({ min: 0.01, max: 100000, noNaN: true }), { maxLength: 5 }),
  }),
  ({ originalAmount, payments, cnReductions }) => {
    // Filter to valid allocations (sum ≤ original)
    const validPayments = filterToValidAllocations(payments, originalAmount);
    const validCns = filterToValidAllocations(cnReductions, originalAmount - sum(validPayments));
    
    const item = createOpenItem(originalAmount);
    validPayments.forEach(p => applyPayment(item, p));
    validCns.forEach(cn => applyCnReduction(item, cn));
    
    const expectedRemaining = originalAmount - sum(validPayments) - sum(validCns);
    return Math.abs(item.remainingAmount - expectedRemaining) < 0.01;
  }
));
```

**Generators**: Random amounts with realistic ranges (0.01 to 1,000,000 THB)
**Edge Cases**: Zero remaining (CLOSED), single satang amounts, max allocations

---

### Property 2: AP/AR Status Consistency

**Validates**: US-026, US-027
**Property**: Status ต้อง consistent กับ remainingAmount เสมอ:
- `remainingAmount = 0` → status = CLOSED
- `0 < remainingAmount < originalAmount` → status = PARTIAL
- `remainingAmount = originalAmount` → status = OPEN

```typescript
fc.assert(fc.property(
  fc.record({
    originalAmount: fc.float({ min: 0.01, max: 1000000, noNaN: true }),
    totalPaid: fc.float({ min: 0, max: 1000000, noNaN: true }),
  }),
  ({ originalAmount, totalPaid }) => {
    const effectivePaid = Math.min(totalPaid, originalAmount);
    const remaining = originalAmount - effectivePaid;
    const status = deriveStatus(originalAmount, remaining);
    
    if (remaining === 0) return status === 'CLOSED';
    if (remaining === originalAmount) return status === 'OPEN';
    return status === 'PARTIAL';
  }
));
```

---

### Property 3: Payment Allocation Sum Invariant

**Validates**: US-014, US-021
**Property**: Sum ของ allocations ใน payment ต้องเท่ากับ totalAmount ของ payment เสมอ (ไม่มี money leak)

```typescript
fc.assert(fc.property(
  fc.record({
    totalAmount: fc.float({ min: 0.01, max: 1000000, noNaN: true }),
    numItems: fc.integer({ min: 1, max: 10 }),
  }),
  ({ totalAmount, numItems }) => {
    const allocations = distributeAmount(totalAmount, numItems);
    const allocSum = allocations.reduce((sum, a) => sum + a.amount, 0);
    return Math.abs(allocSum - totalAmount) < 0.01;
  }
));
```

**Generators**: Random total amounts split across 1-10 open items
**Edge Cases**: Single item allocation, very small amounts, rounding

---

### Property 4: Job Order State Machine — No Invalid Transitions

**Validates**: US-008
**Property**: JO status transitions ต้อง follow sequence OPEN → IN_PROGRESS → DONE เท่านั้น — ไม่มี skip, ไม่มี reverse

```typescript
fc.assert(fc.property(
  fc.array(fc.constantFrom('OPEN', 'IN_PROGRESS', 'DONE'), { minLength: 1, maxLength: 20 }),
  (transitions) => {
    let currentStatus = 'OPEN';
    for (const targetStatus of transitions) {
      const result = attemptTransition(currentStatus, targetStatus);
      if (result.success) {
        // Valid transition must follow sequence
        const validNext = getValidNextStates(currentStatus);
        if (!validNext.includes(targetStatus)) return false;
        currentStatus = targetStatus;
      }
      // Invalid transitions should be rejected (not crash)
    }
    return true;
  }
));
```

**Generators**: Random sequences of status values
**Edge Cases**: Same status repeated, reverse transitions, skip transitions

---

### Property 5: GR/IR Clearing Lifecycle — Open/Close Consistency

**Validates**: US-016, US-017, US-018
**Property**: Clearing ที่ OPEN ต้องถูก close ได้เพียงครั้งเดียว, clearing ที่ CLOSED ต้อง reject การ close ซ้ำ

```typescript
fc.assert(fc.property(
  fc.record({
    clearingAmount: fc.float({ min: 0.01, max: 1000000, noNaN: true }),
    closeAttempts: fc.array(
      fc.record({
        type: fc.constantFrom('CN_RETURN', 'GR_REPLACEMENT'),
        amount: fc.float({ min: 0.01, max: 1000000, noNaN: true }),
      }),
      { minLength: 1, maxLength: 5 }
    ),
  }),
  ({ clearingAmount, closeAttempts }) => {
    const clearing = createClearing(clearingAmount);
    let closedCount = 0;
    
    for (const attempt of closeAttempts) {
      const result = attemptClose(clearing, attempt);
      if (result.success) closedCount++;
    }
    
    // Only first close should succeed
    return closedCount <= 1;
  }
));
```

---

### Property 6: PPV Calculation Correctness

**Validates**: US-018
**Property**: PPV = GR/IR Clearing Amount − (CN invoice price × qty) — ต้องคำนวณถูกเสมอ

```typescript
fc.assert(fc.property(
  fc.record({
    returnQty: fc.integer({ min: 1, max: 1000 }),
    maAtReturn: fc.float({ min: 0.01, max: 10000, noNaN: true }),
    invoiceUnitCost: fc.float({ min: 0.01, max: 10000, noNaN: true }),
  }),
  ({ returnQty, maAtReturn, invoiceUnitCost }) => {
    const clearingAmount = returnQty * maAtReturn;
    const apReduction = returnQty * invoiceUnitCost;
    const expectedPpv = clearingAmount - apReduction;
    
    const result = calculatePpv(clearingAmount, invoiceUnitCost, returnQty);
    return Math.abs(result - expectedPpv) < 0.01;
  }
));
```

---

### Property 7: Invoice Path Determination — Mutual Exclusivity

**Validates**: US-009, US-010, US-011
**Property**: JO ที่มี `hasTempDo=true` ต้องได้ INVOICE_FROM_DO เท่านั้น, JO ที่มี `hasTempDo=false` ต้องได้ SALE_INVOICE เท่านั้น — ไม่มี overlap

```typescript
fc.assert(fc.property(
  fc.boolean(),
  (hasTempDo) => {
    const txType = determineInvoiceType(hasTempDo);
    if (hasTempDo) return txType === 'INVOICE_FROM_DO';
    return txType === 'SALE_INVOICE';
  }
));
```

---

### Property 8: No Double Stock Cut — INVOICE_FROM_DO Zero Invariant

**Validates**: US-010, US-031
**Property**: INVOICE_FROM_DO ต้องมี qty=0, totalCost=0, arAmount=0 เสมอ — ห้ามตัด stock ซ้ำ

```typescript
fc.assert(fc.property(
  fc.record({
    joId: fc.uuid(),
    items: fc.array(fc.record({
      itemId: fc.uuid(),
      qty: fc.integer({ min: 1, max: 100 }),
    }), { minLength: 1, maxLength: 10 }),
  }),
  ({ joId, items }) => {
    // Simulate JO with hasTempDo=true
    const txEntry = createInvoiceFromDo(joId, items);
    return txEntry.qty === 0 && txEntry.totalCost === 0 && txEntry.arAmount === 0;
  }
));
```

---

## Test Configuration

- **Tests per property**: 200 (default), 1000 for critical financial properties (1, 2, 3, 6)
- **Timeout**: 30s per property
- **Shrinking**: Enabled — log failing input, save counterexample to `__snapshots__/`
- **Seed**: Reproducible via `fc.configureGlobal({ seed: Date.now() })`

**Run**: `npx nx test transactions-feature --testPathPattern=properties`

**Organization**:
```
tests/properties/
├── ap-ar-lifecycle.properties.spec.ts    # Properties 1, 2
├── payment-matching.properties.spec.ts   # Property 3
├── jo-state-machine.properties.spec.ts   # Property 4
├── clearing-lifecycle.properties.spec.ts # Properties 5, 6
└── invoice-path.properties.spec.ts       # Properties 7, 8
```
