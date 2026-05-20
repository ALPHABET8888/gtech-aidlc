import { HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '@autoflow/shared-errors';
import { JoNotDoneException } from './jo-not-done.exception';
import { DuplicateTempDoException } from './duplicate-temp-do.exception';
import { DuplicateInvoiceException } from './duplicate-invoice.exception';
import { ReturnQtyExceededException } from './return-qty-exceeded.exception';
import { GrAlreadyReturnedException } from './gr-already-returned.exception';
import { CnReturnInventoryException } from './cn-return-inventory.exception';
import { ClearingNotOpenException } from './clearing-not-open.exception';
import { PaymentExceedsBalanceException } from './payment-exceeds-balance.exception';
import { OpenItemNotFoundException } from './open-item-not-found.exception';

describe('Transaction Domain Exceptions', () => {
  describe('JoNotDoneException', () => {
    it('should create with correct error code and status', () => {
      const ex = new JoNotDoneException('jo-123', 'OPEN');
      expect(ex.errorCode).toBe(ErrorCodes.JO_NOT_DONE);
      expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(ex.metadata).toEqual({ joId: 'jo-123', currentStatus: 'OPEN' });
    });
  });

  describe('DuplicateTempDoException', () => {
    it('should create with CONFLICT status', () => {
      const ex = new DuplicateTempDoException('jo-456');
      expect(ex.errorCode).toBe(ErrorCodes.DUPLICATE_TEMP_DO);
      expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(ex.metadata).toEqual({ joId: 'jo-456' });
    });
  });

  describe('DuplicateInvoiceException', () => {
    it('should create with CONFLICT status', () => {
      const ex = new DuplicateInvoiceException('jo-789');
      expect(ex.errorCode).toBe(ErrorCodes.DUPLICATE_INVOICE);
      expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(ex.metadata).toEqual({ joId: 'jo-789' });
    });
  });

  describe('ReturnQtyExceededException', () => {
    it('should create with UNPROCESSABLE_ENTITY status', () => {
      const ex = new ReturnQtyExceededException('item-1', 10, 5);
      expect(ex.errorCode).toBe(ErrorCodes.RETURN_QTY_EXCEEDED);
      expect(ex.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(ex.metadata).toEqual({ itemId: 'item-1', returnQty: 10, originalQty: 5 });
    });
  });

  describe('GrAlreadyReturnedException', () => {
    it('should create with CONFLICT status', () => {
      const ex = new GrAlreadyReturnedException('gr-tx-1');
      expect(ex.errorCode).toBe(ErrorCodes.GR_ALREADY_RETURNED);
      expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(ex.metadata).toEqual({ grTxId: 'gr-tx-1' });
    });
  });

  describe('CnReturnInventoryException', () => {
    it('should create with BAD_REQUEST status', () => {
      const ex = new CnReturnInventoryException('clearing-1');
      expect(ex.errorCode).toBe(ErrorCodes.CN_RETURN_INVENTORY);
      expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(ex.metadata).toEqual({ clearingId: 'clearing-1' });
    });
  });

  describe('ClearingNotOpenException', () => {
    it('should create with CONFLICT status', () => {
      const ex = new ClearingNotOpenException('clearing-2');
      expect(ex.errorCode).toBe(ErrorCodes.CLEARING_NOT_OPEN);
      expect(ex.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(ex.metadata).toEqual({ clearingId: 'clearing-2' });
    });
  });

  describe('PaymentExceedsBalanceException', () => {
    it('should create with UNPROCESSABLE_ENTITY status', () => {
      const ex = new PaymentExceedsBalanceException('oi-1', 1000, 500);
      expect(ex.errorCode).toBe(ErrorCodes.PAYMENT_EXCEEDS_BALANCE);
      expect(ex.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(ex.metadata).toEqual({ openItemId: 'oi-1', paymentAmount: 1000, remainingBalance: 500 });
    });
  });

  describe('OpenItemNotFoundException', () => {
    it('should create with NOT_FOUND status', () => {
      const ex = new OpenItemNotFoundException('oi-2');
      expect(ex.errorCode).toBe(ErrorCodes.OPEN_ITEM_NOT_FOUND);
      expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(ex.metadata).toEqual({ openItemId: 'oi-2' });
    });
  });
});
