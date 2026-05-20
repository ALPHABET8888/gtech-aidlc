import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateJobOrderDto } from './sales/create-job-order.dto';
import { CreateGoodsReceiptDto } from './purchasing/create-goods-receipt.dto';
import { MakeApPaymentDto } from './ap-ar/make-ap-payment.dto';
import { PaymentMethod } from './ap-ar/make-ap-payment.dto';

describe('Transaction DTOs Validation', () => {
  describe('CreateJobOrderDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(CreateJobOrderDto, {
        customerId: '550e8400-e29b-41d4-a716-446655440000',
        items: [
          { itemId: '550e8400-e29b-41d4-a716-446655440001', qty: 5, unitPrice: 100 },
        ],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with invalid customerId', async () => {
      const dto = plainToInstance(CreateJobOrderDto, {
        customerId: 'not-a-uuid',
        items: [
          { itemId: '550e8400-e29b-41d4-a716-446655440001', qty: 5, unitPrice: 100 },
        ],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('customerId');
    });

    it('should fail validation with empty items', async () => {
      const dto = plainToInstance(CreateJobOrderDto, {
        customerId: '550e8400-e29b-41d4-a716-446655440000',
        items: [],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateGoodsReceiptDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(CreateGoodsReceiptDto, {
        vendorId: '550e8400-e29b-41d4-a716-446655440000',
        taxInvoiceNo: 'TAX-2025-001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        items: [
          { itemId: '550e8400-e29b-41d4-a716-446655440001', qty: 100, unitCost: 50, landedCost: 5 },
        ],
        period: '2025-01',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with invalid period format', async () => {
      const dto = plainToInstance(CreateGoodsReceiptDto, {
        vendorId: '550e8400-e29b-41d4-a716-446655440000',
        taxInvoiceNo: 'TAX-2025-001',
        warehouseId: '550e8400-e29b-41d4-a716-446655440002',
        items: [
          { itemId: '550e8400-e29b-41d4-a716-446655440001', qty: 100, unitCost: 50, landedCost: 5 },
        ],
        period: '2025-1',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('period');
    });
  });

  describe('MakeApPaymentDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(MakeApPaymentDto, {
        vendorId: '550e8400-e29b-41d4-a716-446655440000',
        totalAmount: 5000,
        allocations: [
          { openItemId: '550e8400-e29b-41d4-a716-446655440001', amount: 3000 },
          { openItemId: '550e8400-e29b-41d4-a716-446655440002', amount: 2000 },
        ],
        paymentMethod: PaymentMethod.TRANSFER,
        paymentRef: 'CHQ-001',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail validation with invalid payment method', async () => {
      const dto = plainToInstance(MakeApPaymentDto, {
        vendorId: '550e8400-e29b-41d4-a716-446655440000',
        totalAmount: 5000,
        allocations: [
          { openItemId: '550e8400-e29b-41d4-a716-446655440001', amount: 3000 },
        ],
        paymentMethod: 'BITCOIN',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
