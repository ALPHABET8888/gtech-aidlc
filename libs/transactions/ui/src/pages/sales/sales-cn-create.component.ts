import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TransactionsStateService } from '../../services/transactions-state.service';
import { QtyPositiveValidatorDirective, PricePositiveValidatorDirective } from '../../validators';
import {
  CreateSalesReturnRequest,
  CreateSalesPriceAdjRequest,
  ReturnCondition,
  SalesReturnItem,
} from '../../models';

/**
 * Sales CN Create page — creates CN_SALES_RETURN or CN_SALES_PRICE.
 * Stories: US-012, US-013
 */
@Component({
  selector: 'app-sales-cn-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, QtyPositiveValidatorDirective, PricePositiveValidatorDirective],
  template: `
    <div class="page-header">
      <h1>Create Sales Credit Note</h1>
      <a routerLink="/transactions/job-orders" class="btn">← Back to List</a>
    </div>

    <!-- Success Message -->
    @if (state.submitSuccess()) {
      <div class="alert alert-success">{{ state.submitSuccess() }}</div>
    }

    <!-- Error Message -->
    @if (state.submitError()) {
      <div class="alert alert-error">{{ state.submitError() }}</div>
    }

    <!-- CN Type Selection -->
    <div class="form-group">
      <label>CN Type *</label>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" [(ngModel)]="cnType" name="cnType" value="return" />
          CN Sales Return (CN_SALES_RETURN)
        </label>
        <label class="radio-label">
          <input type="radio" [(ngModel)]="cnType" name="cnType" value="price-adj" />
          CN Sales Price Adjustment (CN_SALES_PRICE)
        </label>
      </div>
    </div>

    <!-- CN_SALES_RETURN Form -->
    @if (cnType === 'return') {
      <form #returnForm="ngForm" (ngSubmit)="onSubmitReturn(returnForm.valid)" novalidate>
        <div class="form-group">
          <label for="refInvoiceTxId">Reference Invoice TX ID *</label>
          <input
            id="refInvoiceTxId"
            type="text"
            [(ngModel)]="returnData.refInvoiceTxId"
            name="refInvoiceTxId"
            required
            placeholder="Invoice transaction UUID"
            #refField="ngModel"
          />
          @if (refField.invalid && refField.touched) {
            <span class="field-error">Reference Invoice TX ID is required</span>
          }
        </div>

        <div class="form-group">
          <label for="condition">Condition *</label>
          <select
            id="condition"
            [(ngModel)]="returnData.condition"
            name="condition"
            required>
            <option value="">Select condition</option>
            <option value="good">Good (stock return + MA recalc)</option>
            <option value="damaged_total">Damaged Total (loss only)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="reason">Reason *</label>
          <textarea
            id="reason"
            [(ngModel)]="returnData.reason"
            name="reason"
            required
            placeholder="Reason for return"
            rows="2"
            #reasonField="ngModel"
          ></textarea>
          @if (reasonField.invalid && reasonField.touched) {
            <span class="field-error">Reason is required</span>
          }
        </div>

        <!-- Return Items -->
        <div class="form-section">
          <div class="section-header">
            <h3>Return Items</h3>
            <button type="button" class="btn btn-sm" (click)="addReturnItem()">+ Add Item</button>
          </div>

          @for (item of returnItems; track $index; let i = $index) {
            <div class="item-row">
              <div class="form-group">
                <label [for]="'rItemId_' + i">Item ID *</label>
                <input
                  [id]="'rItemId_' + i"
                  type="text"
                  [(ngModel)]="item.itemId"
                  [name]="'rItemId_' + i"
                  required
                  placeholder="Item UUID"
                />
              </div>
              <div class="form-group">
                <label [for]="'rQty_' + i">Qty *</label>
                <input
                  [id]="'rQty_' + i"
                  type="number"
                  [(ngModel)]="item.qty"
                  [name]="'rQty_' + i"
                  required
                  appQtyPositive
                  min="1"
                />
              </div>
              <div class="form-group">
                <label [for]="'rWarehouse_' + i">Warehouse ID *</label>
                <input
                  [id]="'rWarehouse_' + i"
                  type="text"
                  [(ngModel)]="item.warehouseId"
                  [name]="'rWarehouse_' + i"
                  required
                  placeholder="Warehouse UUID"
                />
              </div>
              <button
                type="button"
                class="btn btn-danger btn-sm"
                (click)="removeReturnItem(i)"
                [disabled]="returnItems.length <= 1">
                ✕
              </button>
            </div>
          }
        </div>

        <div class="form-actions">
          <button
            type="submit"
            class="btn btn-primary"
            [disabled]="returnForm.invalid || returnItems.length === 0 || state.submitting()">
            {{ state.submitting() ? 'Processing...' : 'Create Sales Return CN' }}
          </button>
        </div>
      </form>
    }

    <!-- CN_SALES_PRICE Form -->
    @if (cnType === 'price-adj') {
      <form #priceForm="ngForm" (ngSubmit)="onSubmitPriceAdj(priceForm.valid)" novalidate>
        <div class="form-group">
          <label for="priceRefInvoiceTxId">Reference Invoice TX ID *</label>
          <input
            id="priceRefInvoiceTxId"
            type="text"
            [(ngModel)]="priceAdjData.refInvoiceTxId"
            name="priceRefInvoiceTxId"
            required
            placeholder="Invoice transaction UUID"
            #priceRefField="ngModel"
          />
          @if (priceRefField.invalid && priceRefField.touched) {
            <span class="field-error">Reference Invoice TX ID is required</span>
          }
        </div>

        <div class="form-group">
          <label for="adjustmentAmount">Adjustment Amount (THB) *</label>
          <input
            id="adjustmentAmount"
            type="number"
            [(ngModel)]="priceAdjData.adjustmentAmount"
            name="adjustmentAmount"
            required
            appPricePositive
            step="0.01"
            placeholder="0.00"
            #amountField="ngModel"
          />
          @if (amountField.invalid && amountField.touched) {
            <span class="field-error">Amount must be greater than 0</span>
          }
        </div>

        <div class="form-group">
          <label for="priceReason">Reason *</label>
          <textarea
            id="priceReason"
            [(ngModel)]="priceAdjData.reason"
            name="priceReason"
            required
            placeholder="Reason for price adjustment"
            rows="2"
            #priceReasonField="ngModel"
          ></textarea>
          @if (priceReasonField.invalid && priceReasonField.touched) {
            <span class="field-error">Reason is required</span>
          }
        </div>

        <div class="form-actions">
          <button
            type="submit"
            class="btn btn-primary"
            [disabled]="priceForm.invalid || state.submitting()">
            {{ state.submitting() ? 'Processing...' : 'Create Price Adjustment CN' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .form-group { margin-bottom: 0.75rem; }
    .form-group label { display: block; font-weight: 500; margin-bottom: 0.25rem; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e0; border-radius: 4px; }
    .radio-group { display: flex; flex-direction: column; gap: 0.5rem; }
    .radio-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
    .radio-label input[type="radio"] { width: auto; }
    .form-section { margin: 1.5rem 0; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .section-header h3 { margin: 0; }
    .item-row { display: grid; grid-template-columns: 2fr 1fr 2fr auto; gap: 0.5rem; align-items: end; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #f0f0f0; }
    .form-actions { display: flex; gap: 0.5rem; margin-top: 1.5rem; }
    .btn { padding: 0.5rem 1rem; border: 1px solid #cbd5e0; border-radius: 4px; cursor: pointer; text-decoration: none; color: inherit; background: white; }
    .btn-primary { background: #3182ce; color: white; border-color: #3182ce; }
    .btn-danger { background: #e53e3e; color: white; border-color: #e53e3e; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; }
    .field-error { color: #e53e3e; font-size: 0.75rem; }
    .alert-success { background: #c6f6d5; color: #22543d; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .alert-error { background: #fed7d7; color: #9b2c2c; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
  `],
})
export class SalesCnCreateComponent implements OnInit, OnDestroy {
  readonly state = inject(TransactionsStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  cnType: 'return' | 'price-adj' = 'return';

  // CN_SALES_RETURN data
  returnData = {
    refInvoiceTxId: '',
    condition: '' as string,
    reason: '',
  };
  returnItems: SalesReturnItem[] = [{ itemId: '', qty: 1, warehouseId: '' }];

  // CN_SALES_PRICE data
  priceAdjData = {
    refInvoiceTxId: '',
    adjustmentAmount: 0,
    reason: '',
  };

  ngOnInit(): void {
    const joId = this.route.snapshot.queryParamMap.get('joId');
    if (joId) {
      this.state.loadJobOrder(joId);
    }
  }

  ngOnDestroy(): void {
    this.state.clearSubmitState();
  }

  // ── Return Items ─────────────────────────────────────────

  addReturnItem(): void {
    this.returnItems = [...this.returnItems, { itemId: '', qty: 1, warehouseId: '' }];
  }

  removeReturnItem(index: number): void {
    this.returnItems = this.returnItems.filter((_, i) => i !== index);
  }

  // ── Submit Handlers ──────────────────────────────────────

  onSubmitReturn(valid: boolean | null | undefined): void {
    if (!valid || this.returnItems.length === 0) return;

    const dto: CreateSalesReturnRequest = {
      refInvoiceTxId: this.returnData.refInvoiceTxId,
      condition: this.returnData.condition as ReturnCondition,
      items: this.returnItems.map((item) => ({
        itemId: item.itemId,
        qty: item.qty,
        warehouseId: item.warehouseId,
      })),
      reason: this.returnData.reason,
    };

    this.state.createSalesReturn(dto, () => {
      this.router.navigate(['/transactions/job-orders']);
    });
  }

  onSubmitPriceAdj(valid: boolean | null | undefined): void {
    if (!valid) return;

    const dto: CreateSalesPriceAdjRequest = {
      refInvoiceTxId: this.priceAdjData.refInvoiceTxId,
      adjustmentAmount: this.priceAdjData.adjustmentAmount,
      reason: this.priceAdjData.reason,
    };

    this.state.createSalesPriceAdj(dto, () => {
      this.router.navigate(['/transactions/job-orders']);
    });
  }
}
