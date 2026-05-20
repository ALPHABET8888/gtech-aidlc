import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/test-app.helper';

/**
 * E2E Test: Sales Path A — Job Order → TEMP_DO → INVOICE_FROM_DO
 *
 * Tests the complete Path A flow through HTTP endpoints:
 * 1. Create Job Order (POST /transactions/job-orders)
 * 2. Advance JO status: OPEN → IN_PROGRESS → DONE
 * 3. Issue TEMP_DO (POST /transactions/job-orders/:joId/temp-do)
 * 4. Issue INVOICE_FROM_DO (POST /transactions/job-orders/:joId/invoice)
 *
 * Validates:
 * - JO state machine transitions via API
 * - TEMP_DO creates AR Open Item
 * - INVOICE_FROM_DO references existing AR (zero new AR)
 * - Duplicate TEMP_DO rejection (409)
 * - JO not DONE rejection (400)
 */
describe('E2E: Sales Path A — JO → TEMP_DO → INVOICE_FROM_DO', () => {
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

  const customerId = 'a1111111-1111-4111-a111-111111111111';
  const itemId = 'b2222222-2222-4222-b222-222222222222';
  const warehouseId = 'c3333333-3333-4333-b333-333333333333';

  /**
   * Helper: Create a JO and advance it to DONE via API calls.
   */
  async function createDoneJobOrder(): Promise<string> {
    // Create JO
    const createRes = await request(app.getHttpServer())
      .post('/transactions/job-orders')
      .send({
        customerId,
        items: [{ itemId, qty: 10, unitPrice: 200, description: 'Test item' }],
        notes: 'E2E Path A test',
      })
      .expect(201);

    const joId = createRes.body.id;

    // Advance to IN_PROGRESS
    await request(app.getHttpServer())
      .patch(`/transactions/job-orders/${joId}/status`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    // Advance to DONE
    await request(app.getHttpServer())
      .patch(`/transactions/job-orders/${joId}/status`)
      .send({ status: 'DONE' })
      .expect(200);

    return joId;
  }

  describe('Complete Path A flow', () => {
    it('should complete JO → TEMP_DO → INVOICE_FROM_DO end-to-end', async () => {
      // Step 1: Create JO and advance to DONE
      const joId = await createDoneJobOrder();

      // Step 2: Issue TEMP_DO
      const tempDoRes = await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/temp-do`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 10 }],
        })
        .expect(201);

      expect(tempDoRes.body.txEntry).toBeDefined();
      expect(tempDoRes.body.txEntry.txType).toBe('TEMP_DO');
      expect(tempDoRes.body.txEntry.status).toBe('POSTED');
      expect(tempDoRes.body.arOpenItem).toBeDefined();
      expect(tempDoRes.body.arOpenItem.status).toBe('OPEN');
      expect(tempDoRes.body.arOpenItem.originalAmount).toBeGreaterThan(0);

      // Step 3: Issue INVOICE_FROM_DO
      const invoiceRes = await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/invoice`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 10 }],
        })
        .expect(201);

      // INVOICE_FROM_DO should reference existing AR, not create new one
      expect(invoiceRes.body.txEntry).toBeDefined();
      expect(invoiceRes.body.arOpenItem).toBeDefined();
      expect(invoiceRes.body.arOpenItem.status).toBe('EXISTING');
      expect(invoiceRes.body.arOpenItem.originalAmount).toBe(0);
    });
  });

  describe('JO state machine via API', () => {
    it('should create JO with OPEN status', async () => {
      const res = await request(app.getHttpServer())
        .post('/transactions/job-orders')
        .send({
          customerId,
          items: [{ itemId, qty: 5, unitPrice: 100 }],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('OPEN');
      expect(res.body.hasTempDo).toBe(false);
      expect(res.body.invoiceId).toBeNull();
    });

    it('should transition OPEN → IN_PROGRESS → DONE', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transactions/job-orders')
        .send({
          customerId,
          items: [{ itemId, qty: 3, unitPrice: 150 }],
        })
        .expect(201);

      const joId = createRes.body.id;

      // OPEN → IN_PROGRESS
      const ipRes = await request(app.getHttpServer())
        .patch(`/transactions/job-orders/${joId}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(ipRes.body.status).toBe('IN_PROGRESS');

      // IN_PROGRESS → DONE
      const doneRes = await request(app.getHttpServer())
        .patch(`/transactions/job-orders/${joId}/status`)
        .send({ status: 'DONE' })
        .expect(200);
      expect(doneRes.body.status).toBe('DONE');
    });

    it('should reject invalid transition OPEN → DONE (skip)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transactions/job-orders')
        .send({
          customerId,
          items: [{ itemId, qty: 2, unitPrice: 50 }],
        })
        .expect(201);

      const joId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/transactions/job-orders/${joId}/status`)
        .send({ status: 'DONE' })
        .expect(400);
    });
  });

  describe('TEMP_DO validation', () => {
    it('should reject TEMP_DO when JO is not DONE', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/transactions/job-orders')
        .send({
          customerId,
          items: [{ itemId, qty: 5, unitPrice: 100 }],
        })
        .expect(201);

      const joId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/temp-do`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 5 }],
        })
        .expect(400);
    });

    it('should reject duplicate TEMP_DO for same JO', async () => {
      const joId = await createDoneJobOrder();

      // First TEMP_DO — success
      await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/temp-do`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 10 }],
        })
        .expect(201);

      // Second TEMP_DO — conflict
      await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/temp-do`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 10 }],
        })
        .expect(409);
    });
  });

  describe('AR Open Item creation', () => {
    it('should create exactly one AR Open Item for Path A (on TEMP_DO)', async () => {
      const joId = await createDoneJobOrder();
      const arCountBefore = stores.arStore.size;

      // TEMP_DO creates AR
      await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/temp-do`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 10 }],
        })
        .expect(201);

      expect(stores.arStore.size).toBe(arCountBefore + 1);

      // INVOICE_FROM_DO does NOT create another AR
      await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/invoice`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 10 }],
        })
        .expect(201);

      expect(stores.arStore.size).toBe(arCountBefore + 1); // Still same count
    });
  });
});
