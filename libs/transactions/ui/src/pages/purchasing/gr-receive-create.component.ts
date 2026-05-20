import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { TransactionsStateService } from '../../services/transactions-state.service';
import { GrReceiveRequest } from '../../models';

interface GrReceiveItemRow {
  itemId: string;
  qty: number | null;
  unitCost: number | null;
  landedCost: number | null;
}

/**
 * GR Receive Create Page — Records goods receipt from vendor (GR_RECEIVE).
 * US-015: Store Staff records goods receipt with tax invoice.
 */
@Component({
  selector: 'app-gr-receive-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <h2>รับสินค้า (GR Receive)</h2>
      <p class="subtitle">บันทึกการรับสินค้าจากผู้ขาย</p>

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

      <form #grForm="ngForm" (ngSubmit)="onSubmit(grForm)">
        <!-- Vendor Selection -->
        <div class="form-group">
          <label for="vendorId">ผู้ขาย <span class="required">*</span></label>
          <select
            id="vendorId"
            name="vendorId"
            [(ngModel)]="vendorId"
            required
            aria-required="true"
          >
            <option value="">-- เลือกผู้ขาย --</option>
            @for (vendor of state.activeVendors(); track vendor.id) {
              <option [value]="vendor.id">{{ vendor.code }} - {{ vendor.name }}</option>
            }
          </select>
        </div>

        <!-- Tax Invoice No -->
        <div class="form-group">
          <label for="taxInvoiceNo">เลขที่ใบกำกับภาษี <span class="required">*</span></label>
          <input
            type="text"
            id="taxInvoiceNo"
            name="taxInvoiceNo"
            [(ngModel)]="taxInvoiceNo"
            required
            placeholder="TAX-2025-001"
            aria-required="true"
          />
        </div>

        <!-- Warehouse Selection -->
        <div class="form-group">
          <label for="warehouseId">คลังสินค้า <span class="required">*</span></label>
          <select
            id="warehouseId"
            name="warehouseId"
            [(ngModel)]="warehouseId"
            required
            aria-required="true"
          >
            <option value="">-- เลือกคลังสินค้า --</option>
            @for (wh of state.activeWarehouses(); track wh.id) {
              <option [value]="wh.id">{{ wh.code }} - {{ wh.name }}</option>
            }
          </select>
        </div>

        <!-- Period -->
        <div class="form-group">
          <label for="period">งวด (Period) <span class="required">*</span></label>
          <input
            type="text"
            id="period"
            name="period"
            [(ngModel)]="period"
            required
            pattern="\\d{4}-\\d{2}"
            placeholder="2025-01"
            aria-required="true"
          />
        </div>

        <!-- Items Table -->
        <div class="form-group">
          <label>รายการสินค้า <span class="required">*</span></label>
          <table class="items-table" aria-label="รายการสินค้ารับเข้า">
            <thead>
              <tr>
                <th>สินค้า</th>
                <th>จำนวน</th>
                <th>ราคาต่อหน่วย (฿)</th>
                <th>ค่าขนส่ง/หน่วย (฿)</th>
                <th>รวม (฿)</th>
                <th>ลบ</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track $index) {
                <tr>
                  <td>
                    <select
                      [name]="'itemId_' + $index"
                      [(ngModel)]="item.itemId"
                      required
                      aria-label="เลือกสินค้า"
                    >
                      <option value="">-- เลือก --</option>
                      @for (i of state.activeItems(); track i.id) {
                        <option [value]="i.id">{{ i.code }} - {{ i.name }}</option>
                      }
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      [name]="'qty_' + $index"
                      [(ngModel)]="item.qty"
                      required
                      min="1"
                      aria-label="จำนวน"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      [name]="'unitCost_' + $index"
                      [(ngModel)]="item.unitCost"
                      required
                      min="0"
                      step="0.01"
                      aria-label="ราคาต่อหน่วย"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      [name]="'landedCost_' + $index"
                      [(ngModel)]="item.landedCost"
                      required
                      min="0"
                      step="0.01"
                      aria-label="ค่าขนส่งต่อหน่วย"
                    />
                  </td>
                  <td class="text-right">
                    {{ calculateLineTotal(item) | number:'1.2-2' }}
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn-icon"
                      (click)="removeItem($index)"
                      [disabled]="items().length <= 1"
                      aria-label="ลบรายการ"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" class="text-right"><strong>รวมทั้งหมด</strong></td>
                <td class="text-right"><strong>{{ grandTotal() | number:'1.2-2' }}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <button type="button" class="btn-secondary" (click)="addItem()">
            + เพิ่มรายการ
          </button>
        </div>

        <!-- Submit -->
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            [disabled]="grForm.invalid || state.submitting() || items().length === 0"
          >
            {{ state.submitting() ? 'กำลังบันทึก...' : 'บันทึกรับสินค้า' }}
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
    input, select { width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
    input:invalid:not(:placeholder-shown) { border-color: #dc3545; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .items-table th, .items-table td { padding: 8px; border: 1px solid #ddd; text-align: left; }
    .items-table th { background: #f5f5f5; font-weight: 500; }
    .items-table td select, .items-table td input { width: 100%; min-width: 80px; }
    .text-right { text-align: right; }
    .btn-primary { padding: 10px 24px; background: #1976d2; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .btn-primary:disabled { background: #90caf9; cursor: not-allowed; }
    .btn-secondary { padding: 10px 24px; background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 14px; margin-left: 8px; }
    .btn-icon { background: none; border: none; cursor: pointer; font-size: 16px; color: #dc3545; }
    .btn-icon:disabled { color: #ccc; cursor: not-allowed; }
    .form-actions { margin-top: 24px; display: flex; gap: 8px; }
    .alert { padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; }
    .alert-error { background: #fdecea; color: #b71c1c; border: 1px solid #f5c6cb; }
    .alert-success { background: #e8f5e9; color: #1b5e20; border: 1px solid #c8e6c9; }
  `],
})
export class GrReceiveCreateComponent {
  readonly state = inject(TransactionsStateService);
  private readonly router = inject(Router);

  constructor() {
    this.state.loadMasterData();
  }

  vendorId = '';
  taxInvoiceNo = '';
  warehouseId = '';
  period = '';

  readonly items = signal<GrReceiveItemRow[]>([
    { itemId: '', qty: null, unitCost: null, landedCost: null },
  ]);

  readonly grandTotal = computed(() =>
    this.items().reduce((sum, item) => sum + this.calculateLineTotal(item), 0)
  );

  calculateLineTotal(item: GrReceiveItemRow): number {
    const qty = item.qty ?? 0;
    const unitCost = item.unitCost ?? 0;
    const landedCost = item.landedCost ?? 0;
    return qty * (unitCost + landedCost);
  }

  addItem(): void {
    this.items.update((list) => [
      ...list,
      { itemId: '', qty: null, unitCost: null, landedCost: null },
    ]);
  }

  removeItem(index: number): void {
    if (this.items().length > 1) {
      this.items.update((list) => list.filter((_, i) => i !== index));
    }
  }

  onSubmit(form: NgForm): void {
    if (form.invalid) return;

    this.state.clearSubmitState();

    const dto: GrReceiveRequest = {
      vendorId: this.vendorId,
      taxInvoiceNo: this.taxInvoiceNo,
      warehouseId: this.warehouseId,
      items: this.items().map((item) => ({
        itemId: item.itemId,
        qty: item.qty ?? 0,
        unitCost: item.unitCost ?? 0,
        landedCost: item.landedCost ?? 0,
      })),
      period: this.period,
    };

    this.state.createGoodsReceipt(dto, () => {
      this.resetForm(form);
    });
  }

  onCancel(): void {
    this.router.navigate(['/transactions']);
  }

  private resetForm(form: NgForm): void {
    form.resetForm();
    this.vendorId = '';
    this.taxInvoiceNo = '';
    this.warehouseId = '';
    this.period = '';
    this.items.set([{ itemId: '', qty: null, unitCost: null, landedCost: null }]);
  }
}
