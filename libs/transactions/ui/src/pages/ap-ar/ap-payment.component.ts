import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { TransactionsStateService } from '../../services/transactions-state.service';
import { OpenItemSelectorComponent } from '../../components/open-item-selector.component';
import { PaymentAllocationComponent, AllocationOutput } from '../../components/payment-allocation.component';
import { ApOpenItemDetail, ArOpenItemDetail, MakeApPaymentRequest, PaymentMethod } from '../../models';

/**
 * AP Payment Page — Record AP payment with manual allocation matching (D3-3).
 * US-021: Manager records AP payment allocated to open items.
 */
@Component({
  selector: 'app-ap-payment',
  standalone: true,
  imports: [CommonModule, FormsModule, OpenItemSelectorComponent, PaymentAllocationComponent],
  template: `
    <div class="page-container">
      <h2>บันทึกจ่ายเงิน (AP Payment)</h2>
      <p class="subtitle">เลือกรายการเจ้าหนี้และจัดสรรยอดชำระ</p>

      @if (state.submitError()) {
        <div class="alert alert-error" role="alert">
          {{ state.submitError() }}
        </div>
      }

      @if (state.submitSuccess()) {
        <div class="alert alert-success" role="alert">
          {{ state.submitSuccess() }}
        </div>
      }

      <form #paymentForm="ngForm" (ngSubmit)="onSubmit(paymentForm)">
        <!-- Vendor Selection -->
        <div class="form-group">
          <label for="vendorId">ผู้ขาย <span class="required">*</span></label>
          <select
            id="vendorId"
            name="vendorId"
            [(ngModel)]="vendorId"
            (ngModelChange)="onVendorChange()"
            required
            aria-required="true"
          >
            <option value="">-- เลือกผู้ขาย --</option>
            @for (vendor of state.activeVendors(); track vendor.id) {
              <option [value]="vendor.id">{{ vendor.code }} - {{ vendor.name }}</option>
            }
          </select>
        </div>

        <!-- Payment Method -->
        <div class="form-row">
          <div class="form-group">
            <label for="paymentMethod">วิธีชำระ <span class="required">*</span></label>
            <select
              id="paymentMethod"
              name="paymentMethod"
              [(ngModel)]="paymentMethod"
              required
              aria-required="true"
            >
              <option value="">-- เลือก --</option>
              <option value="TRANSFER">โอนเงิน</option>
              <option value="CHEQUE">เช็ค</option>
            </select>
          </div>
          <div class="form-group">
            <label for="paymentRef">เลขที่อ้างอิง</label>
            <input
              type="text"
              id="paymentRef"
              name="paymentRef"
              [(ngModel)]="paymentRef"
              placeholder="CHQ-001 หรือ เลขที่โอน"
            />
          </div>
        </div>

        <!-- Open Item Selector -->
        @if (vendorId) {
          <app-open-item-selector
            title="รายการเจ้าหนี้ค้างชำระ"
            [items]="state.apOpenItems()"
            (selectionChange)="onSelectionChange($event)"
          />
        }

        <!-- Payment Allocation -->
        @if (selectedItems().length > 0) {
          <app-payment-allocation
            [selectedItems]="selectedItems()"
            (allocationsChange)="onAllocationsChange($event)"
            (totalChange)="onTotalChange($event)"
          />

          <!-- Total Summary -->
          <div class="total-summary">
            <div class="total-row">
              <span>ยอดชำระรวม:</span>
              <strong>{{ totalAmount() | number:'1.2-2' }} ฿</strong>
            </div>
          </div>
        }

        <!-- Submit -->
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            [disabled]="!canSubmit()"
          >
            {{ state.submitting() ? 'กำลังบันทึก...' : 'บันทึกจ่ายเงิน' }}
          </button>
          <button type="button" class="btn-secondary" (click)="onCancel()">
            ยกเลิก
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .page-container { max-width: 900px; margin: 0 auto; padding: 24px; }
    h2 { margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-weight: 500; margin-bottom: 4px; }
    .required { color: #dc3545; }
    .form-row { display: flex; gap: 16px; }
    .form-row .form-group { flex: 1; }
    input, select { width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
    .total-summary { margin-top: 16px; padding: 16px; background: #f5f5f5; border-radius: 4px; }
    .total-row { display: flex; justify-content: space-between; align-items: center; font-size: 16px; }
    .form-actions { margin-top: 24px; display: flex; gap: 8px; }
    .btn-primary { padding: 10px 24px; background: #1976d2; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .btn-primary:disabled { background: #90caf9; cursor: not-allowed; }
    .btn-secondary { padding: 10px 24px; background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .alert { padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; }
    .alert-error { background: #fdecea; color: #b71c1c; border: 1px solid #f5c6cb; }
    .alert-success { background: #e8f5e9; color: #1b5e20; border: 1px solid #c8e6c9; }
  `],
})
export class ApPaymentComponent {
  readonly state = inject(TransactionsStateService);
  private readonly router = inject(Router);

  vendorId = '';
  paymentMethod: PaymentMethod | '' = '';
  paymentRef = '';

  readonly selectedItems = signal<ApOpenItemDetail[]>([]);
  readonly allocations = signal<AllocationOutput[]>([]);
  readonly totalAmount = signal(0);

  readonly canSubmit = computed(() => {
    return (
      this.vendorId !== '' &&
      this.paymentMethod !== '' &&
      this.allocations().length > 0 &&
      this.totalAmount() > 0 &&
      !this.state.submitting()
    );
  });

  onVendorChange(): void {
    if (this.vendorId) {
      this.state.loadApOpenItems({ vendorId: this.vendorId, status: 'OPEN,PARTIAL' });
    }
    this.selectedItems.set([]);
    this.allocations.set([]);
    this.totalAmount.set(0);
  }

  onSelectionChange(items: (ApOpenItemDetail | ArOpenItemDetail)[]): void {
    this.selectedItems.set(items as ApOpenItemDetail[]);
  }

  onAllocationsChange(allocs: AllocationOutput[]): void {
    this.allocations.set(allocs);
  }

  onTotalChange(total: number): void {
    this.totalAmount.set(total);
  }

  onSubmit(form: NgForm): void {
    if (!this.canSubmit()) return;

    this.state.clearSubmitState();

    const dto: MakeApPaymentRequest = {
      vendorId: this.vendorId,
      totalAmount: this.totalAmount(),
      allocations: this.allocations().map((a) => ({
        apOpenItemId: a.openItemId,
        amount: a.amount,
      })),
      paymentMethod: this.paymentMethod as PaymentMethod,
      paymentRef: this.paymentRef || undefined,
    };

    this.state.makeApPayment(dto, () => {
      // Refresh open items after successful payment
      this.onVendorChange();
    });
  }

  onCancel(): void {
    this.router.navigate(['/transactions/ap']);
  }
}
