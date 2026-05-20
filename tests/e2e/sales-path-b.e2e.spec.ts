import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/test-app.helper';

/**
 * E2E Test: Sales Path B — Job Order → SALE_INVOICE
 *
 * Tests the complete Path B flow through HTTP endpoints:
 * 1. Create Job Order (POST /transactions/job-orders)
 * 2. Advance JO status: OPEN → IN_PROGRESS → DONE
 * 3. Issue SALE_INVOICE directly (POST /transactions/job-orders/:joId/invoice)
 *
 * Validates:
 * - SALE_INVOICE is issued when no TEMP_DO exists (hasTempDo=false)
 * - AR Open Item is created with correct amount
 * - Duplicate invoice rejection (409)
 * - JO not DONE rejection (400)
 * - JO detail reflects invoiceId after issuance
 */
describe('E2E: Sales Path B — JO → SALE_INVOICE', () => {
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
    const createRes = await request(app.getHttpServer())
      .post('/transactions/job-orders')
      .send({
        customerId,
        items: [{ itemId, qty: 5, unitPrice: 300, description: 'Path B item' }],
        notes: 'E2E Path B test',
      })
      .expect(201);

    const joId = createRes.body.id;

    await request(app.getHttpServer())
      .patch(`/transactions/job-orders/${joId}/status`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/transactions/job-orders/${joId}/status`)
      .send({ status: 'DONE' })
      .expect(200);

    return joId;
  }

  describe('Complete Path B flow', () => {
    it('should complete JO → SALE_INVOICE end-to-end', async () => {
      // Step 1: Create JO and advance to DONE
      const joId = await createDoneJobOrder();

      // Step 2: Issue SALE_INVOICE directly (no TEMP_DO)
      const invoiceRes = await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/invoice`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 5 }],
        })
        .expect(201);

      // Verify TX entry
      expect(invoiceRes.body.txEntry).toBeDefined();
      expect(invoiceRes.body.txEntry.status).toBe('POSTED');

      // Verify AR Open Item created
      expect(invoiceRes.body.arOpenItem).toBeDefined();
      expect(invoiceRes.body.arOpenItem.status).toBe('OPEN');
      expect(invoiceRes.body.arOpenItem.originalAmount).toBeGreaterThan(0);
    });

    it('should create AR Open Item with correct amount (including VAT)', async () => {
      const joId = await createDoneJobOrder();

      const invoiceRes = await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/invoice`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 5 }],
        })
        .expect(201);

      // Amount = qty * unitPrice + 7% VAT = 5 * 300 + 105 = 1605
      const arItem = invoiceRes.body.arOpenItem;
      expect(arItem.originalAmount).toBe(1605);
      expect(arItem.status).toBe('OPEN');
    });
  });

  describe('Invoice validation', () => {
    it('should reject invoice when JO is not DONE', async () => {
      // Create JO but don't advance to DONE
      const createRes = await request(app.getHttpServer())
        .post('/transactions/job-orders')
        .send({
          customerId,
          items: [{ itemId, qty: 5, unitPrice: 300 }],
        })
        .expect(201);

      const joId = createRes.body.id;

      // Try to issue invoice on OPEN JO
      await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/invoice`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 5 }],
        })
        .expect(400);
    });

    it('should reject duplicate invoice for same JO', async () => {
      const joId = await createDoneJobOrder();

      // First invoice — success
      await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/invoice`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 5 }],
        })
        .expect(201);

      // Second invoice — conflict
      await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/invoice`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 5 }],
        })
        .expect(409);
    });
  });

  describe('JO detail after invoice', () => {
    it('should reflect invoiceId in JO detail after SALE_INVOICE', async () => {
      const joId = await createDoneJobOrder();

      await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/invoice`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 5 }],
        })
        .expect(201);

      // Verify JO detail shows invoiceId
      const joDetail = await request(app.getHttpServer())
        .get(`/transactions/job-orders/${joId}`)
        .expect(200);

      expect(joDetail.body.invoiceId).toBeDefined();
      expect(joDetail.body.hasTempDo).toBe(false);
    });
  });

  describe('Path determination', () => {
    it('should issue SALE_INVOICE (not INVOICE_FROM_DO) when hasTempDo=false', async () => {
      const joId = await createDoneJobOrder();

      const invoiceRes = await request(app.getHttpServer())
        .post(`/transactions/job-orders/${joId}/invoice`)
        .send({
          warehouseId,
          items: [{ itemId, qty: 5 }],
        })
        .expect(201);

      // When no TEMP_DO exists, should be SALE_INVOICE with real AR
      expect(invoiceRes.body.arOpenItem.status).toBe('OPEN');
      expect(invoiceRes.body.arOpenItem.originalAmount).toBeGreaterThan(0);
    });
  });
});
