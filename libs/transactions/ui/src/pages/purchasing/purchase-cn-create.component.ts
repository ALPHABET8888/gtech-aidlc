import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { TransactionsStateService } from '../../services/transactions-state.service';
import { CnReturnRequest, CnPriceAdjRequest, CnDebtRequest } from '../../models';

type CnType = 'CN_RETURN' | 'CN_PRICE_ADJ' | 'AP_CN_DEBT';

/**
 * Purchase CN Create Page — Creates purchase credit notes.
 * Supports 3 CN types via tab selection:
 * - CN_RETURN (US-018): AP reduction + PPV + clearing close
 * - CN_PRICE_ADJ (US-019): Inventory + AP adjustment
 * - AP_CN_DEBT (US-020): AP reduction only
 */
@Component({
  selector: 'app-purchase-cn-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <h2>ใบลดหนี้ซื้อ (Purchase Credit Note)</h2>
      <p class="subtitle">สร้างใบลดหนี้จากผู้ขาย</p>

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

      <!-- CN Type Tabs -->
      <div class="tabs" role="tablist" aria-label="ประเภทใบลดหนี้">
        <button
          type="button"
          role="tab"
          [class.active]="selectedType() === 'CN_RETURN'"
          [attr.aria-selected]="selectedType() === 'CN_RETURN'"
          (click)="selectType('CN_RETURN')"
        >
          CN คืนสินค้า
        </button>
        <button
          type="button"
          role="tab"
          [class.active]="selectedType() === 'CN_PRICE_ADJ'"
          [attr.aria-selected]="selectedType() === 'CN_PRICE_ADJ'"
          (click)="selectType('CN_PRICE_ADJ')"
        >
          CN ปรับราคา
        </button>
        <button
          type="button"
          role="tab"
          [class.active]="selectedType() === 'AP_CN_DEBT'"
          [attr.aria-selected]="selectedType() === 'AP_CN_DEBT'"
          (click)="selectType('AP_CN_DEBT')"
        >
          CN ลดหนี้
        </button>
      </div>

      <!-- CN_RETURN Form -->
      @if (selectedType() === 'CN_RETURN') {
        <form #cnReturnForm="ngForm" (ngSubmit)="onSubmitCnReturn(cnReturnForm)">
          <div class="form-section">
            <p class="form-description">
              ใบลดหนี้จากการคืนสินค้า — ลด AP + ปิด GR/IR Clearing + คำนวณ PPV
            </p>

            <div class="form-group">
              <label for="cnReturn_refGrReturnTxId">อ้างอิง GR Return TX ID <span class="required">*</span></label>
              <input
                type="text"
                id="cnReturn_refGrReturnTxId"
                name="refGrReturnTxId"
                [(ngModel)]="cnReturnRefGrReturnTxId"
                required
                placeholder="UUID ของ GR Return"
                aria-required="true"
              />
            </div>

            <div class="form-group">
              <label for="cnReturn_clearingId">Clearing ID <span class="required">*</span></label>
              <input
                type="text"
                id="cnReturn_clearingId"
                name="clearingId"
                [(ngModel)]="cnReturnClearingId"
                required
                placeholder="UUID ของ GR/IR Clearing"
                aria-required="true"
              />
            </div>

            <div class="form-actions">
              <button
                type="submit"
                class="btn-primary"
                [disabled]="cnReturnForm.invalid || state.submitting()"
              >
                {{ state.submitting() ? 'กำลังบันทึก...' : 'สร้าง CN คืนสินค้า' }}
              </button>
            </div>
          </div>
        </form>
      }

      <!-- CN_PRICE_ADJ Form -->
      @if (selectedType() === 'CN_PRICE_ADJ') {
        <form #cnPriceForm="ngForm" (ngSubmit)="onSubmitCnPriceAdj(cnPriceForm)">
          <div class="form-section">
            <p class="form-description">
              ใบลดหนี้ปรับราคา — ปรับมูลค่าสินค้าคงเหลือ + ลด AP + คำนวณ MA ใหม่
            </p>

            <div class="form-group">
              <label for="cnPrice_refGrTxId">อ้างอิง GR Receive TX ID <span class="required">*</span></label>
              <input
                type="text"
                id="cnPrice_refGrTxId"
                name="refGrTxId"
                [(ngModel)]="cnPriceRefGrTxId"
                required
                placeholder="UUID ของ GR Receive"
                aria-required="true"
              />
            </div>

            <div class="form-group">
              <label for="cnPrice_adjustmentPerUnit">ส่วนลดต่อหน่วย (฿) <span class="required">*</span></label>
              <input
                type="number"
                id="cnPrice_adjustmentPerUnit"
                name="adjustmentPerUnit"
                [(ngModel)]="cnPriceAdjustmentPerUnit"
                required
                min="0.01"
                step="0.01"
                placeholder="5.00"
                aria-required="true"
              />
            </div>

            <div class="form-group">
              <label for="cnPrice_qty">จำนวน (หน่วย) <span class="required">*</span></label>
              <input
                type="number"
                id="cnPrice_qty"
                name="qty"
                [(ngModel)]="cnPriceQty"
                required
                min="1"
                placeholder="100"
                aria-required="true"
              />
            </div>

            <div class="form-group calculated">
              <label>ยอดลดหนี้รวม</label>
              <span class="calculated-value">{{ cnPriceAdjTotal() | number:'1.2-2' }} ฿</span>
            </div>

            <div class="form-actions">
              <button
                type="submit"
                class="btn-primary"
                [disabled]="cnPriceForm.invalid || state.submitting()"
              >
                {{ state.submitting() ? 'กำลังบันทึก...' : 'สร้าง CN ปรับราคา' }}
              </button>
            </div>
          </div>
        </form>
      }

      <!-- AP_CN_DEBT Form -->
      @if (selectedType() === 'AP_CN_DEBT') {
        <form #cnDebtForm="ngForm" (ngSubmit)="onSubmitCnDebt(cnDebtForm)">
          <div class="form-section">
            <p class="form-description">
              ใบลดหนี้ (AP เท่านั้น) — ลด AP โดยไม่กระทบสินค้าคงเหลือ เช่น ส่วนลดจ่ายเร็ว
            </p>

            <div class="form-group">
              <label for="cnDebt_refInvoiceTxId">อ้างอิง Invoice TX ID <span class="required">*</span></label>
              <input
                type="text"
                id="cnDebt_refInvoiceTxId"
                name="refInvoiceTxId"
                [(ngModel)]="cnDebtRefInvoiceTxId"
                required
                placeholder="UUID ของ Invoice/GR"
                aria-required="true"
              />
            </div>

            <div class="form-group">
              <label for="cnDebt_amount">จำนวนเงิน (฿) <span class="required">*</span></label>
              <input
                type="number"
                id="cnDebt_amount"
                name="amount"
                [(ngModel)]="cnDebtAmount"
                required
                min="0.01"
                step="0.01"
                placeholder="200.00"
                aria-required="true"
              />
            </div>

            <div class="form-group">
              <label for="cnDebt_reason">เหตุผล <span class="required">*</span></label>
              <textarea
                id="cnDebt_reason"
                name="reason"
                [(ngModel)]="cnDebtReason"
                required
                rows="3"
                placeholder="ระบุเหตุผล เช่น ส่วนลดจ่ายเร็ว"
                aria-required="true"
              ></textarea>
            </div>

            <div class="form-actions">
              <button
                type="submit"
                class="btn-primary"
                [disabled]="cnDebtForm.invalid || state.submitting()"
              >
                {{ state.submitting() ? 'กำลังบันทึก...' : 'สร้าง CN ลดหนี้' }}
              </button>
            </div>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .page-container { max-width: 900px; margin: 0 auto; padding: 24px; }
    h2 { margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; }
    .tabs { display: flex; gap: 0; margin-bottom: 24px; border-bottom: 2px solid #e0e0e0; }
    .tabs button { padding: 12px 24px; border: none; background: none; cursor: pointer; font-size: 14px; font-weight: 500; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
    .tabs button.active { color: #1976d2; border-bottom-color: #1976d2; }
    .tabs button:hover:not(.active) { color: #333; background: #f5f5f5; }
    .form-section { padding: 16px 0; }
    .form-description { color: #555; margin-bottom: 20px; font-size: 14px; background: #f9f9f9; padding: 12px; border-radius: 4px; border-left: 3px solid #1976d2; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-weight: 500; margin-bottom: 4px; }
    .form-group.calculated { background: #f5f5f5; padding: 12px; border-radius: 4px; }
    .calculated-value { font-size: 18px; font-weight: 600; color: #1976d2; }
    .required { color: #dc3545; }
    input, select, textarea { width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; font-family: inherit; }
    textarea { resize: vertical; }
    input:invalid:not(:placeholder-shown) { border-color: #dc3545; }
    .btn-primary { padding: 10px 24px; background: #1976d2; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .btn-primary:disabled { background: #90caf9; cursor: not-allowed; }
    .form-actions { margin-top: 24px; }
    .alert { padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; }
    .alert-error { background: #fdecea; color: #b71c1c; border: 1px solid #f5c6cb; }
    .alert-success { background: #e8f5e9; color: #1b5e20; border: 1px solid #c8e6c9; }
  `],
})
export class PurchaseCnCreateComponent {
  readonly state = inject(TransactionsStateService);

  readonly selectedType = signal<CnType>('CN_RETURN');

  // CN_RETURN form fields
  cnReturnRefGrReturnTxId = '';
  cnReturnClearingId = '';

  // CN_PRICE_ADJ form fields
  cnPriceRefGrTxId = '';
  cnPriceAdjustmentPerUnit: number | null = null;
  cnPriceQty: number | null = null;

  // AP_CN_DEBT form fields
  cnDebtRefInvoiceTxId = '';
  cnDebtAmount: number | null = null;
  cnDebtReason = '';

  // Computed total for CN_PRICE_ADJ
  readonly cnPriceAdjTotal = computed(() => {
    const adj = this.cnPriceAdjustmentPerUnit ?? 0;
    const qty = this.cnPriceQty ?? 0;
    return adj * qty;
  });

  selectType(type: CnType): void {
    this.selectedType.set(type);
    this.state.clearSubmitState();
  }

  onSubmitCnReturn(form: NgForm): void {
    if (form.invalid) return;
    this.state.clearSubmitState();

    const dto: CnReturnRequest = {
      refGrReturnTxId: this.cnReturnRefGrReturnTxId,
      clearingId: this.cnReturnClearingId,
    };

    this.state.createCnReturn(dto, () => {
      form.resetForm();
      this.cnReturnRefGrReturnTxId = '';
      this.cnReturnClearingId = '';
    });
  }

  onSubmitCnPriceAdj(form: NgForm): void {
    if (form.invalid) return;
    this.state.clearSubmitState();

    const dto: CnPriceAdjRequest = {
      refGrTxId: this.cnPriceRefGrTxId,
      adjustmentPerUnit: this.cnPriceAdjustmentPerUnit ?? 0,
      qty: this.cnPriceQty ?? 0,
    };

    this.state.createCnPriceAdj(dto, () => {
      form.resetForm();
      this.cnPriceRefGrTxId = '';
      this.cnPriceAdjustmentPerUnit = null;
      this.cnPriceQty = null;
    });
  }

  onSubmitCnDebt(form: NgForm): void {
    if (form.invalid) return;
    this.state.clearSubmitState();

    const dto: CnDebtRequest = {
      refInvoiceTxId: this.cnDebtRefInvoiceTxId,
      amount: this.cnDebtAmount ?? 0,
      reason: this.cnDebtReason,
    };

    this.state.createCnDebt(dto, () => {
      form.resetForm();
      this.cnDebtRefInvoiceTxId = '';
      this.cnDebtAmount = null;
      this.cnDebtReason = '';
    });
  }
}
