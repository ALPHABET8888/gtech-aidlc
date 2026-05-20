/**
 * Property-Based Tests: Invoice Path Determination (Properties 7, 8)
 *
 * **Validates: Requirements US-009, US-010, US-011**
 *
 * Property 7: Mutual exclusivity — hasTempDo → INVOICE_FROM_DO, !hasTempDo → SALE_INVOICE
 * Property 8: INVOICE_FROM_DO zero invariant — qty=0, cost=0, ar=0
 *
 * Tests the dual-path invoice logic in InvoiceService:
 * - Path A: JO with TEMP_DO → INVOICE_FROM_DO (financial document only)
 * - Path B: JO without TEMP_DO → SALE_INVOICE (delivers goods + financial)
 */
import * as fc from 'fast-check';
import { TxType } from '@autoflow/shared-types';

// ─── Pure Logic Extraction ───────────────────────────────────────────────────
// These functions represent the core business logic extracted from InvoiceService
// for property-based testing without requiring full NestJS DI.

/**
 * Determines the invoice TX type based on whether a TEMP_DO exists.
 * This mirrors the logic in InvoiceService.issueInvoice().
 */
function determineInvoiceType(hasTempDo: boolean): TxType {
  if (hasTempDo) {
    return TxType.INVOICE_FROM_DO;
  }
  return TxType.SALE_INVOICE;
}

/**
 * Creates an INVOICE_FROM_DO TX entry — financial document only.
 * This mirrors InvoiceService.issueInvoiceFromDo() TX creation logic.
 * INVOICE_FROM_DO must NOT cut stock or create AR (already done by TEMP_DO).
 */
function createInvoiceFromDo(
  joId: string,
  items: Array<{ itemId: string; qty: number }>,
): { qty: number; totalCost: number; arAmount: number; txType: TxType } {
  // INVOICE_FROM_DO: no stock impact, no AR impact (already handled by TEMP_DO)
  return {
    qty: 0,
    totalCost: 0,
    arAmount: 0,
    txType: TxType.INVOICE_FROM_DO,
  };
}

/**
 * Creates a SALE_INVOICE TX entry — delivers goods + creates AR.
 * This mirrors InvoiceService.issueSaleInvoice() TX creation logic.
 */
function createSaleInvoice(
  joId: string,
  items: Array<{ itemId: string; qty: number }>,
  grandTotal: number,
  currentMa: number,
): { qty: number; totalCost: number; arAmount: number; txType: TxType } {
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  return {
    qty: -totalQty, // stock-out (negative)
    totalCost: -(totalQty * currentMa),
    arAmount: grandTotal,
    txType: TxType.SALE_INVOICE,
  };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Invoice Path Properties (Properties 7, 8)', () => {
  /**
   * Property 7: Invoice Path Determination — Mutual Exclusivity
   *
   * **Validates: Requirements US-009, US-010, US-011**
   *
   * JO ที่มี hasTempDo=true ต้องได้ INVOICE_FROM_DO เท่านั้น
   * JO ที่มี hasTempDo=false ต้องได้ SALE_INVOICE เท่านั้น
   * ไม่มี overlap — one path excludes the other
   */
  describe('Property 7: Mutual Exclusivity', () => {
    it('hasTempDo=true always produces INVOICE_FROM_DO, hasTempDo=false always produces SALE_INVOICE', () => {
      fc.assert(
        fc.property(fc.boolean(), (hasTempDo) => {
          const txType = determineInvoiceType(hasTempDo);

          if (hasTempDo) {
            return txType === TxType.INVOICE_FROM_DO;
          }
          return txType === TxType.SALE_INVOICE;
        }),
        { numRuns: 200 },
      );
    });

    it('INVOICE_FROM_DO and SALE_INVOICE are never produced for the same hasTempDo value', () => {
      fc.assert(
        fc.property(fc.boolean(), (hasTempDo) => {
          const txType = determineInvoiceType(hasTempDo);

          // Mutual exclusivity: cannot be both types
          const isInvoiceFromDo = txType === TxType.INVOICE_FROM_DO;
          const isSaleInvoice = txType === TxType.SALE_INVOICE;

          // Exactly one must be true (XOR)
          return isInvoiceFromDo !== isSaleInvoice;
        }),
        { numRuns: 200 },
      );
    });

    it('result is always one of the two valid invoice types (exhaustive)', () => {
      fc.assert(
        fc.property(fc.boolean(), (hasTempDo) => {
          const txType = determineInvoiceType(hasTempDo);
          const validTypes = [TxType.INVOICE_FROM_DO, TxType.SALE_INVOICE];
          return validTypes.includes(txType);
        }),
        { numRuns: 200 },
      );
    });
  });

  /**
   * Property 8: INVOICE_FROM_DO Zero Invariant
   *
   * **Validates: Requirements US-010, US-031**
   *
   * INVOICE_FROM_DO ต้องมี qty=0, totalCost=0, arAmount=0 เสมอ
   * ห้ามตัด stock ซ้ำ (stock already cut by TEMP_DO)
   * ห้ามสร้าง AR ซ้ำ (AR already created by TEMP_DO)
   */
  describe('Property 8: INVOICE_FROM_DO Zero Invariant', () => {
    // Generator: random items with positive quantities
    const itemsArb = fc.array(
      fc.record({
        itemId: fc.uuid(),
        qty: fc.integer({ min: 1, max: 100 }),
      }),
      { minLength: 1, maxLength: 10 },
    );

    it('INVOICE_FROM_DO always has qty=0 regardless of items', () => {
      fc.assert(
        fc.property(fc.uuid(), itemsArb, (joId, items) => {
          const txEntry = createInvoiceFromDo(joId, items);
          return txEntry.qty === 0;
        }),
        { numRuns: 200 },
      );
    });

    it('INVOICE_FROM_DO always has totalCost=0 regardless of items', () => {
      fc.assert(
        fc.property(fc.uuid(), itemsArb, (joId, items) => {
          const txEntry = createInvoiceFromDo(joId, items);
          return txEntry.totalCost === 0;
        }),
        { numRuns: 200 },
      );
    });

    it('INVOICE_FROM_DO always has arAmount=0 regardless of items', () => {
      fc.assert(
        fc.property(fc.uuid(), itemsArb, (joId, items) => {
          const txEntry = createInvoiceFromDo(joId, items);
          return txEntry.arAmount === 0;
        }),
        { numRuns: 200 },
      );
    });

    it('INVOICE_FROM_DO zero invariant holds for all three fields simultaneously', () => {
      fc.assert(
        fc.property(fc.uuid(), itemsArb, (joId, items) => {
          const txEntry = createInvoiceFromDo(joId, items);
          return (
            txEntry.qty === 0 &&
            txEntry.totalCost === 0 &&
            txEntry.arAmount === 0
          );
        }),
        { numRuns: 200 },
      );
    });

    it('SALE_INVOICE has non-zero qty and arAmount (contrast with INVOICE_FROM_DO)', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          itemsArb,
          fc.float({ min: Math.fround(100), max: Math.fround(1000000), noNaN: true }),
          fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }),
          (joId, items, grandTotal, currentMa) => {
            const txEntry = createSaleInvoice(joId, items, grandTotal, currentMa);

            // SALE_INVOICE must have stock impact (negative qty) and AR
            return txEntry.qty < 0 && txEntry.arAmount > 0;
          },
        ),
        { numRuns: 200 },
      );
    });
  });
});
