import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApOpenItemDetail, ArOpenItemDetail } from '../models';

export interface AllocationRow {
  openItemId: string;
  refTxType: string;
  originalAmount: number;
  remainingAmount: number;
  allocatedAmount: number | null;
}

export interface AllocationOutput {
  openItemId: string;
  amount: number;
}

/**
 * Shared component for allocating payment amounts to selected open items.
 * Users can enter specific amounts per item or use "จ่ายเต็ม" to auto-fill remaining.
 */
@Component({
  selector: 'app-payment-allocation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="allocation-container">
      <h4>จัดสรรยอดชำระ</h4>

      @if (rows().length === 0) {
        <p class="empty-state">กรุณาเลือกรายการค้างชำระจากด้านบน</p>
      } @else {
        <table class="allocation-table" aria-label="จัดสรรยอดชำระ">
          <thead>
            <tr>
              <th>เอกสาร</th>
              <th>ประเภท</th>
              <th class="col-amount">ยอดคงเหลือ (฿)</th>
              <th class="col-amount">ยอดชำระ (฿)</th>
              <th>จ่ายเต็ม</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.openItemId) {
              <tr>
                <td>{{ row.openItemId.slice(0, 8) }}...</td>
                <td>{{ row.refTxType }}</td>
                <td class="col-amount">{{ row.remainingAmount | number:'1.2-2' }}</td>
                <td class="col-amount">
                  <input
                    type="number"
                    [name]="'alloc_' + row.openItemId"
                    [(ngModel)]="row.allocatedAmount"
                    (ngModelChange)="onAmountChange()"
                    min="0.01"
                    [max]="row.remainingAmount"
                    step="0.01"
                    placeholder="0.00"
                    aria-label="ยอดชำระ"
                    class="amount-input"
                  />
                </td>
                <td class="col-action">
                  <button
                    type="button"
                    class="btn-fill"
                    (click)="fillRemaining(row)"
                    aria-label="จ่ายเต็มจำนวน"
                  >
                    เต็ม
                  </button>
                </td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" class="col-amount"><strong>รวมยอดจัดสรร</strong></td>
              <td class="col-amount">
                <strong [class.over-allocated]="isOverAllocated()">
                  {{ totalAllocated() | number:'1.2-2' }}
                </strong>
              </td>
              <td>
                <button
                  type="button"
                  class="btn-fill-all"
                  (click)="fillAll()"
                  aria-label="จ่ายเต็มทุกรายการ"
                >
                  เต็มทั้งหมด
                </button>
              </td>
            </tr>
          </tfoot>
        </table>

        @if (isOverAllocated()) {
          <p class="validation-error" role="alert">
            ⚠️ ยอดจัดสรรเกินยอดคงเหลือ
          </p>
        }
      }
    </div>
  `,
  styles: [`
    .allocation-container { border: 1px solid #e0e0e0; border-radius: 4px; padding: 16px; margin-top: 16px; }
    .allocation-container h4 { margin: 0 0 12px 0; }
    .empty-state { text-align: center; color: #999; padding: 16px; }
    .allocation-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .allocation-table th, .allocation-table td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
    .allocation-table th { background: #f9f9f9; font-weight: 500; }
    .col-amount { text-align: right; }
    .col-action { text-align: center; width: 80px; }
    .amount-input { width: 120px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; text-align: right; font-size: 13px; }
    .amount-input:focus { border-color: #1976d2; outline: none; }
    .btn-fill { padding: 4px 8px; background: #e3f2fd; border: 1px solid #90caf9; border-radius: 4px; cursor: pointer; font-size: 12px; color: #1565c0; }
    .btn-fill:hover { background: #bbdefb; }
    .btn-fill-all { padding: 4px 8px; background: #e8f5e9; border: 1px solid #a5d6a7; border-radius: 4px; cursor: pointer; font-size: 12px; color: #2e7d32; }
    .btn-fill-all:hover { background: #c8e6c9; }
    .over-allocated { color: #dc3545; }
    .validation-error { color: #dc3545; font-size: 13px; margin-top: 8px; }
  `],
})
export class PaymentAllocationComponent {
  @Input() set selectedItems(value: (ApOpenItemDetail | ArOpenItemDetail)[]) {
    this.rows.set(
      value.map((item) => ({
        openItemId: item.id,
        refTxType: item.refTxType,
        originalAmount: item.originalAmount,
        remainingAmount: item.remainingAmount,
        allocatedAmount: null,
      }))
    );
    this.emitAllocations();
  }
  @Output() allocationsChange = new EventEmitter<AllocationOutput[]>();
  @Output() totalChange = new EventEmitter<number>();

  readonly rows = signal<AllocationRow[]>([]);

  readonly totalAllocated = computed(() =>
    this.rows().reduce((sum, row) => sum + (row.allocatedAmount ?? 0), 0)
  );

  readonly isOverAllocated = computed(() =>
    this.rows().some((row) => (row.allocatedAmount ?? 0) > row.remainingAmount)
  );

  fillRemaining(row: AllocationRow): void {
    this.rows.update((list) =>
      list.map((r) =>
        r.openItemId === row.openItemId
          ? { ...r, allocatedAmount: r.remainingAmount }
          : r
      )
    );
    this.emitAllocations();
  }

  fillAll(): void {
    this.rows.update((list) =>
      list.map((r) => ({ ...r, allocatedAmount: r.remainingAmount }))
    );
    this.emitAllocations();
  }

  onAmountChange(): void {
    this.emitAllocations();
  }

  private emitAllocations(): void {
    const allocations: AllocationOutput[] = this.rows()
      .filter((r) => r.allocatedAmount !== null && r.allocatedAmount > 0)
      .map((r) => ({
        openItemId: r.openItemId,
        amount: r.allocatedAmount!,
      }));
    this.allocationsChange.emit(allocations);
    this.totalChange.emit(this.totalAllocated());
  }
}
