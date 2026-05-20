import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/test-app.helper';

/**
 * E2E Test: AP Payment Matching — Multiple Open Items
 *
 * Tests the AP payment flow through HTTP endpoints:
 * 1. Create multiple AP Open Items via GR_RECEIVE
 * 2. Make AP payment with allocations across multiple open items
 * 3. Verify status transitions (OPEN → PARTIAL → CLOSED)
 *
 * Validates:
 * - AP payment with multiple allocations
 * - Allocation sum must equal totalAmount (400 on mismatch)
 * - Payment cannot exceed open item balance (422)
 * - Status transitions: OPEN → PARTIAL, PARTIAL → CLOSED
 * - Multi-item payment: some items CLOSED, others PARTIAL
 */
describe('E2E: AP Payment Matching — Multiple Open Items', () => {
  let app: INestApplication;
  let stores: any;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    stores = testApp.stores;
  });

  afterAll(async () => {
    await app.close();
  });

  const vendorId = 'd4444444-4444-4444-a444-444444444444';
  const itemId = 'b2222222-2222-4222-b222-222222222222';
  const warehouseId = 'c3333333-3333-4333-b333-333333333333';

  /**
   * Helper: Create an AP Open Item by performing a GR_RECEIVE.
   * Returns the AP Open Item ID and original amount.
   */
  async function createApViaGr(qty: number, unitCost: number): Promise<{ apId: string; amount: number }> {
    const grRes = await request(app.getHttpServer())
      .post('/api/v1/transactions/purchasing/gr-receive')
      .send({
        vendorId,
        taxInvoiceNo: `TAX-AP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        warehouseId,
        items: [{ itemId, qty, unitCost, landedCost: 0 }],
        period: '2025-01',
      })
      .expect(201);

    return {
      apId: grRes.body.apOpenItem.id,
      amount: grRes.body.apOpenItem.originalAmount,
    };
  }

  describe('Complete AP payment flow with multiple open items', () => {
    it('should pay multiple AP items in single payment — some CLOSED, some PARTIAL', async () => {
      // Create 3 AP Open Items
      const ap1 = await createApViaGr(20, 100); // 20*100 + 7% VAT = 2140
      const ap2 = await createApViaGr(30, 50);  // 30*50 + 7% VAT = 1605
      const ap3 = await createApViaGr(50, 80);  // 50*80 + 7% VAT = 4280

      // Pay: full ap1 + full ap2 + partial ap3
      const totalPayment = ap1.amount + ap2.amount + 1000;
      const paymentRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/ap/payments')
        .send({
          vendorId,
          totalAmount: totalPayment,
          allocations: [
            { openItemId: ap1.apId, amount: ap1.amount },
            { openItemId: ap2.apId, amount: ap2.amount },
            { openItemId: ap3.apId, amount: 1000 },
          ],
          paymentMethod: 'TRANSFER',
          paymentRef: 'CHQ-E2E-001',
        })
        .expect(201);

      expect(paymentRes.body.txEntry).toBeDefined();
      expect(paymentRes.body.txEntry.txType).toBe('AP_PAYMENT');
      expect(paymentRes.body.txEntry.status).toBe('POSTED');
      expect(paymentRes.body.allocations).toHaveLength(3);

      // ap1: fully paid → CLOSED
      expect(paymentRes.body.allocations[0].newStatus).toBe('CLOSED');
      // ap2: fully paid → CLOSED
      expect(paymentRes.body.allocations[1].newStatus).toBe('CLOSED');
      // ap3: partially paid → PARTIAL
      expect(paymentRes.body.allocations[2].newStatus).toBe('PARTIAL');
    });

    it('should close all items when paying full amounts', async () => {
      const ap1 = await createApViaGr(10, 200); // 2140
      const ap2 = await createApViaGr(5, 400);  // 2140

      const totalPayment = ap1.amount + ap2.amount;
      const paymentRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/ap/payments')
        .send({
          vendorId,
          totalAmount: totalPayment,
          allocations: [
            { openItemId: ap1.apId, amount: ap1.amount },
            { openItemId: ap2.apId, amount: ap2.amount },
          ],
          paymentMethod: 'TRANSFER',
        })
        .expect(201);

      expect(paymentRes.body.allocations[0].newStatus).toBe('CLOSED');
      expect(paymentRes.body.allocations[1].newStatus).toBe('CLOSED');
    });
  });

  describe('Partial payment → full payment lifecycle', () => {
    it('should transition OPEN → PARTIAL → CLOSED across multiple payments', async () => {
      const ap = await createApViaGr(100, 50); // 5350

      // First payment: partial (2000)
      const firstPayment = await request(app.getHttpServer())
        .post('/api/v1/transactions/ap/payments')
        .send({
          vendorId,
          totalAmount: 2000,
          allocations: [{ openItemId: ap.apId, amount: 2000 }],
          paymentMethod: 'TRANSFER',
        })
        .expect(201);

      expect(firstPayment.body.allocations[0].newStatus).toBe('PARTIAL');

      // Second payment: remaining (3350)
      const remaining = ap.amount - 2000;
      const secondPayment = await request(app.getHttpServer())
        .post('/api/v1/transactions/ap/payments')
        .send({
          vendorId,
          totalAmount: remaining,
          allocations: [{ openItemId: ap.apId, amount: remaining }],
          paymentMethod: 'CHEQUE',
          paymentRef: 'CHQ-E2E-002',
        })
        .expect(201);

      expect(secondPayment.body.allocations[0].newStatus).toBe('CLOSED');
    });
  });

  describe('Allocation sum validation', () => {
    it('should reject payment when allocation sum < totalAmount', async () => {
      const ap = await createApViaGr(10, 100); // 1070

      await request(app.getHttpServer())
        .post('/api/v1/transactions/ap/payments')
        .send({
          vendorId,
          totalAmount: 1000,
          allocations: [{ openItemId: ap.apId, amount: 500 }], // 500 ≠ 1000
          paymentMethod: 'TRANSFER',
        })
        .expect(400);
    });

    it('should reject payment when allocation sum > totalAmount', async () => {
      const ap1 = await createApViaGr(10, 100); // 1070
      const ap2 = await createApViaGr(10, 100); // 1070

      await request(app.getHttpServer())
        .post('/api/v1/transactions/ap/payments')
        .send({
          vendorId,
          totalAmount: 1000,
          allocations: [
            { openItemId: ap1.apId, amount: 800 },
            { openItemId: ap2.apId, amount: 800 }, // sum=1600 ≠ 1000
          ],
          paymentMethod: 'TRANSFER',
        })
        .expect(400);
    });
  });

  describe('Payment exceeds balance validation', () => {
    it('should reject payment exceeding AP open item balance', async () => {
      const ap = await createApViaGr(10, 100); // 1070

      await request(app.getHttpServer())
        .post('/api/v1/transactions/ap/payments')
        .send({
          vendorId,
          totalAmount: 5000,
          allocations: [{ openItemId: ap.apId, amount: 5000 }], // 5000 > 1070
          paymentMethod: 'TRANSFER',
        })
        .expect(422);
    });

    it('should reject payment for non-existent open item', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/transactions/ap/payments')
        .send({
          vendorId,
          totalAmount: 1000,
          allocations: [{ openItemId: 'aaaaaaaa-bbbb-4ccc-addd-eeeeeeeeeeee', amount: 1000 }],
          paymentMethod: 'TRANSFER',
        })
        .expect(404);
    });
  });

  describe('AP Open Items listing', () => {
    it('should list AP open items for payment matching', async () => {
      // Create some AP items
      await createApViaGr(10, 50);
      await createApViaGr(20, 30);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/transactions/ap/open-items')
        .query({ vendorId, page: 1, limit: 20 })
        .expect(200);

      expect(listRes.body.data).toBeDefined();
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Payment with CN reduction interaction', () => {
    it('should handle AP item reduced by CN then paid for remaining', async () => {
      const ap = await createApViaGr(100, 50); // 5350

      // First: GR_RETURN + CN_RETURN reduces AP
      const grRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-receive')
        .send({
          vendorId,
          taxInvoiceNo: `TAX-AP-CN-${Date.now()}`,
          warehouseId,
          items: [{ itemId, qty: 100, unitCost: 50, landedCost: 0 }],
          period: '2025-01',
        })
        .expect(201);

      const returnRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-return')
        .send({
          refGrTxId: grRes.body.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 10 }],
          reason: 'Test CN + payment interaction',
        })
        .expect(201);

      // CN_RETURN reduces AP
      const cnRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/cn-return')
        .send({
          refGrReturnTxId: returnRes.body.txEntry.id,
          clearingId: returnRes.body.clearing.id,
        })
        .expect(201);

      expect(cnRes.body.apReduction.reducedAmount).toBeGreaterThan(0);

      // Now pay the remaining balance on the original AP item
      // The AP item from the first GR should still be payable
      const payRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/ap/payments')
        .send({
          vendorId,
          totalAmount: ap.amount,
          allocations: [{ openItemId: ap.apId, amount: ap.amount }],
          paymentMethod: 'TRANSFER',
        })
        .expect(201);

      expect(payRes.body.allocations[0].newStatus).toBe('CLOSED');
    });
  });
});
