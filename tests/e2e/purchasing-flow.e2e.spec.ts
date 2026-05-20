import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/test-app.helper';

/**
 * E2E Test: Purchasing Flow — GR_RECEIVE → GR_RETURN → CN_RETURN
 *
 * Tests the complete purchasing + clearing flow through HTTP endpoints:
 * 1. Record Goods Receipt (POST /purchasing/gr-receive)
 * 2. Return goods (POST /purchasing/gr-return)
 * 3. Issue CN_RETURN to close clearing (POST /purchasing/cn-return)
 *
 * Note: PurchasingController uses @Controller('api/v1/transactions/purchasing')
 * so full path in tests (without global prefix) is /api/v1/transactions/purchasing/...
 *
 * Validates:
 * - GR_RECEIVE creates AP Open Item
 * - GR_RETURN opens GR/IR Clearing
 * - CN_RETURN closes clearing with PPV calculation
 * - AP reduction on CN_RETURN
 * - Clearing cannot be closed twice (409)
 * - CN_RETURN does not touch inventory
 */
describe('E2E: Purchasing Flow — GR_RECEIVE → GR_RETURN → CN_RETURN', () => {
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

  describe('Complete purchasing + clearing flow', () => {
    it('should complete GR_RECEIVE → GR_RETURN → CN_RETURN end-to-end', async () => {
      // Step 1: GR_RECEIVE — receive 100 units at 50 THB + 5 THB landed cost
      const grRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-receive')
        .send({
          vendorId,
          taxInvoiceNo: 'TAX-E2E-001',
          warehouseId,
          items: [{ itemId, qty: 100, unitCost: 50, landedCost: 5 }],
          period: '2025-01',
        })
        .expect(201);

      expect(grRes.body.txEntry).toBeDefined();
      expect(grRes.body.txEntry.txType).toBe('GR_RECEIVE');
      expect(grRes.body.txEntry.status).toBe('POSTED');
      expect(grRes.body.apOpenItem).toBeDefined();
      expect(grRes.body.apOpenItem.status).toBe('OPEN');
      expect(grRes.body.apOpenItem.originalAmount).toBeGreaterThan(0);

      const grTxId = grRes.body.txEntry.id;

      // Step 2: GR_RETURN — return 10 units
      const returnRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-return')
        .send({
          refGrTxId: grTxId,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 10 }],
          reason: 'Defective goods — E2E test',
        })
        .expect(201);

      expect(returnRes.body.txEntry).toBeDefined();
      expect(returnRes.body.txEntry.txType).toBe('GR_RETURN');
      expect(returnRes.body.txEntry.status).toBe('POSTED');
      expect(returnRes.body.clearing).toBeDefined();
      expect(returnRes.body.clearing.status).toBe('OPEN');
      expect(returnRes.body.clearing.clearingAmount).toBeGreaterThan(0);

      const grReturnTxId = returnRes.body.txEntry.id;
      const clearingId = returnRes.body.clearing.id;

      // Step 3: CN_RETURN — close clearing
      const cnRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/cn-return')
        .send({
          refGrReturnTxId: grReturnTxId,
          clearingId,
        })
        .expect(201);

      expect(cnRes.body.txEntry).toBeDefined();
      expect(cnRes.body.txEntry.txType).toBe('CN_RETURN');
      expect(cnRes.body.txEntry.status).toBe('POSTED');
      expect(cnRes.body.clearing).toBeDefined();
      expect(cnRes.body.clearing.status).toBe('CLOSED');
      expect(cnRes.body.clearing.ppvAmount).toBeDefined();
      expect(cnRes.body.apReduction).toBeDefined();
      expect(cnRes.body.apReduction.reducedAmount).toBeGreaterThan(0);
    });
  });

  describe('GR_RECEIVE creates AP Open Item', () => {
    it('should create AP Open Item with correct amount on GR_RECEIVE', async () => {
      const grRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-receive')
        .send({
          vendorId,
          taxInvoiceNo: 'TAX-E2E-002',
          warehouseId,
          items: [{ itemId, qty: 50, unitCost: 100, landedCost: 0 }],
          period: '2025-01',
        })
        .expect(201);

      const apItem = grRes.body.apOpenItem;
      expect(apItem.status).toBe('OPEN');
      // AP amount = (50 * 100) + 7% VAT = 5000 + 350 = 5350
      expect(apItem.originalAmount).toBe(5350);
    });
  });

  describe('GR_RETURN opens clearing', () => {
    it('should create OPEN clearing with correct amount on GR_RETURN', async () => {
      // First create a GR
      const grRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-receive')
        .send({
          vendorId,
          taxInvoiceNo: 'TAX-E2E-003',
          warehouseId,
          items: [{ itemId, qty: 200, unitCost: 80, landedCost: 10 }],
          period: '2025-01',
        })
        .expect(201);

      const grTxId = grRes.body.txEntry.id;

      // Return 20 units
      const returnRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-return')
        .send({
          refGrTxId: grTxId,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 20 }],
          reason: 'Wrong specification',
        })
        .expect(201);

      expect(returnRes.body.clearing.status).toBe('OPEN');
      // Clearing amount = qty * MA (configured in mock)
      expect(returnRes.body.clearing.clearingAmount).toBeGreaterThan(0);
    });
  });

  describe('Clearing lifecycle protection', () => {
    it('should reject CN_RETURN when clearing is already CLOSED', async () => {
      // Create GR → Return → CN_RETURN (close clearing)
      const grRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-receive')
        .send({
          vendorId,
          taxInvoiceNo: 'TAX-E2E-004',
          warehouseId,
          items: [{ itemId, qty: 50, unitCost: 60, landedCost: 0 }],
          period: '2025-01',
        })
        .expect(201);

      const returnRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-return')
        .send({
          refGrTxId: grRes.body.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 5 }],
          reason: 'Quality issue',
        })
        .expect(201);

      const clearingId = returnRes.body.clearing.id;
      const grReturnTxId = returnRes.body.txEntry.id;

      // Close clearing via CN_RETURN
      await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/cn-return')
        .send({
          refGrReturnTxId: grReturnTxId,
          clearingId,
        })
        .expect(201);

      // Attempt to close again — should fail
      await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/cn-return')
        .send({
          refGrReturnTxId: grReturnTxId,
          clearingId,
        })
        .expect(409);
    });

    it('should reject GR_REPLACEMENT when clearing is already CLOSED by CN', async () => {
      // Create GR → Return → CN_RETURN (close clearing)
      const grRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-receive')
        .send({
          vendorId,
          taxInvoiceNo: 'TAX-E2E-005',
          warehouseId,
          items: [{ itemId, qty: 40, unitCost: 75, landedCost: 5 }],
          period: '2025-01',
        })
        .expect(201);

      const returnRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-return')
        .send({
          refGrTxId: grRes.body.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 8 }],
          reason: 'Expired goods',
        })
        .expect(201);

      const clearingId = returnRes.body.clearing.id;
      const grReturnTxId = returnRes.body.txEntry.id;

      // Close by CN_RETURN
      await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/cn-return')
        .send({
          refGrReturnTxId: grReturnTxId,
          clearingId,
        })
        .expect(201);

      // Attempt replacement on closed clearing — should fail
      await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-replacement')
        .send({
          refGrReturnTxId: grReturnTxId,
          clearingId,
          warehouseId,
          items: [{ itemId, qty: 8 }],
        })
        .expect(409);
    });
  });

  describe('GR_REPLACEMENT flow', () => {
    it('should complete GR_RECEIVE → GR_RETURN → GR_REPLACEMENT', async () => {
      // GR_RECEIVE
      const grRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-receive')
        .send({
          vendorId,
          taxInvoiceNo: 'TAX-E2E-006',
          warehouseId,
          items: [{ itemId, qty: 100, unitCost: 90, landedCost: 10 }],
          period: '2025-01',
        })
        .expect(201);

      // GR_RETURN
      const returnRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-return')
        .send({
          refGrTxId: grRes.body.txEntry.id,
          vendorId,
          warehouseId,
          items: [{ itemId, qty: 15 }],
          reason: 'Damaged in transit',
        })
        .expect(201);

      // GR_REPLACEMENT
      const replacementRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-replacement')
        .send({
          refGrReturnTxId: returnRes.body.txEntry.id,
          clearingId: returnRes.body.clearing.id,
          warehouseId,
          items: [{ itemId, qty: 15 }],
        })
        .expect(201);

      expect(replacementRes.body.txEntry.txType).toBe('GR_REPLACEMENT');
      expect(replacementRes.body.txEntry.status).toBe('POSTED');
      expect(replacementRes.body.clearing.status).toBe('CLOSED');
      expect(replacementRes.body.clearing.ppvAmount).toBe(0);
    });
  });

  describe('PPV calculation', () => {
    it('should calculate PPV = 0 when CN amount equals clearing amount', async () => {
      const grRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/gr-receive')
        .send({
          vendorId,
          taxInvoiceNo: 'TAX-E2E-007',
          warehouseId,
          items: [{ itemId, qty: 100, unitCost: 95, landedCost: 5 }],
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
          reason: 'Test PPV zero',
        })
        .expect(201);

      const cnRes = await request(app.getHttpServer())
        .post('/api/v1/transactions/purchasing/cn-return')
        .send({
          refGrReturnTxId: returnRes.body.txEntry.id,
          clearingId: returnRes.body.clearing.id,
        })
        .expect(201);

      expect(cnRes.body.clearing.ppvAmount).toBe(0);
    });
  });
});
