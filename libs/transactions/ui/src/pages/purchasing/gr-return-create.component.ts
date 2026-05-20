import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { TransactionsStateService } from '../../services/transactions-state.service';
import { GrReturnRequest } from '../../models';

interface GrReturnItemRow {
  itemId: string;
  qty: number | null;
}

/**
 * GR Return Create Page — Records goods return to vendor (GR_RETURN).
 * US-016: Supervisor records goods return with reason.
 * Creates a GR/IR Clearing entry (OPEN status).
 */
@Component({
  selector: 'app-gr-return-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <h2>คืนสินค้า (GR Return)</h2>
      <p class="subtitle">บันทึกการคืนสินค้าให้ผู้ขาย — สร้าง GR/IR Clearing</p>

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

      <form #grReturnForm="ngForm" (ngSubmit)="onSubmit(grReturnForm)">
        <!-- Reference GR TX -->
        <div class="form-group">
          <label for="refGrTxId">อ้างอิง GR Receive TX ID <span class="required">*</span></label>
          <input
            type="text"
            id="refGrTxId"
            name="refGrTxId"
            [(ngModel)]="refGrTxId"
            required
            placeholder="UUID ของ GR Receive ที่ต้องการคืน"
            aria-required="true"
          />
        </div>

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

        <!-- Reason -->
        <div class="form-group">
          <label for="reason">เหตุผลการคืน <span class="required">*</span></label>
          <textarea
            id="reason"
            name="reason"
            [(ngModel)]="reason"
            required
            rows="3"
            placeholder="ระบุเหตุผลการคืนสินค้า เช่น สินค้าไม่ตรง spec"
            aria-required="true"
          ></textarea>
        </div>

        <!-- Items Table -->
        <div class="form-group">
          <label>รายการสินค้าที่คืน <span class="required">*</span></label>
          <table class="items-table" aria-label="รายการสินค้าคืน">
            <thead>
              <tr>
                <th>สินค้า</th>
                <th>จำนวนที่คืน</th>
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
            [disabled]="grReturnForm.invalid || state.submitting() || items().length === 0"
          >
            {{ state.submitting() ? 'กำลังบันทึก...' : 'บันทึกคืนสินค้า' }}
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
    input, select, textarea { width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; font-family: inherit; }
    textarea { resize: vertical; }
    input:invalid:not(:placeholder-shown) { border-color: #dc3545; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .items-table th, .items-table td { padding: 8px; border: 1px solid #ddd; text-align: left; }
    .items-table th { background: #f5f5f5; font-weight: 500; }
    .items-table td select, .items-table td input { width: 100%; min-width: 80px; }
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
export class GrReturnCreateComponent {
  readonly state = inject(TransactionsStateService);
  private readonly router = inject(Router);

  constructor() {
    this.state.loadMasterData();
  }

  refGrTxId = '';
  vendorId = '';
  warehouseId = '';
  reason = '';

  readonly items = signal<GrReturnItemRow[]>([{ itemId: '', qty: null }]);

  addItem(): void {
    this.items.update((list) => [...list, { itemId: '', qty: null }]);
  }

  removeItem(index: number): void {
    if (this.items().length > 1) {
      this.items.update((list) => list.filter((_, i) => i !== index));
    }
  }

  onSubmit(form: NgForm): void {
    if (form.invalid) return;

    this.state.clearSubmitState();

    const dto: GrReturnRequest = {
      refGrTxId: this.refGrTxId,
      vendorId: this.vendorId,
      warehouseId: this.warehouseId,
      items: this.items().map((item) => ({
        itemId: item.itemId,
        qty: item.qty ?? 0,
      })),
      reason: this.reason,
    };

    this.state.createGoodsReturn(dto, () => {
      this.resetForm(form);
    });
  }

  onCancel(): void {
    this.router.navigate(['/transactions']);
  }

  private resetForm(form: NgForm): void {
    form.resetForm();
    this.refGrTxId = '';
    this.vendorId = '';
    this.warehouseId = '';
    this.reason = '';
    this.items.set([{ itemId: '', qty: null }]);
  }
}
