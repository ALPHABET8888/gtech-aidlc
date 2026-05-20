import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApOpenItemDetail, ArOpenItemDetail, ApArStatus } from '../models';

export type OpenItemRow = (ApOpenItemDetail | ArOpenItemDetail) & { selected: boolean };

/**
 * Shared component for selecting open items (AP or AR) for payment allocation.
 * Displays a filterable list with checkboxes for selection.
 */
@Component({
  selector: 'app-open-item-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="selector-container">
      <div class="selector-header">
        <h4>{{ title }}</h4>
        <div class="filter-row">
          <label>
            <input
              type="checkbox"
              [checked]="showPartialOnly()"
              (change)="togglePartialFilter()"
              aria-label="แสดงเฉพาะ OPEN/PARTIAL"
            />
            แสดงเฉพาะรายการค้างชำระ
          </label>
          <span class="item-count">{{ filteredItems().length }} รายการ</span>
        </div>
      </div>

      @if (filteredItems().length === 0) {
        <p class="empty-state">ไม่พบรายการค้างชำระ</p>
      } @else {
        <table class="open-items-table" [attr.aria-label]="title">
          <thead>
            <tr>
              <th class="col-check">
                <input
                  type="checkbox"
                  [checked]="allSelected()"
                  (change)="toggleAll()"
                  aria-label="เลือกทั้งหมด"
                />
              </th>
              <th>เอกสารอ้างอิง</th>
              <th>ประเภท TX</th>
              <th class="col-amount">ยอดเดิม (฿)</th>
              <th class="col-amount">ยอดคงเหลือ (฿)</th>
              <th>สถานะ</th>
              <th>วันที่</th>
            </tr>
          </thead>
          <tbody>
            @for (item of filteredItems(); track item.id) {
              <tr
                [class.selected]="item.selected"
                (click)="toggleItem(item)"
                role="button"
                [attr.aria-pressed]="item.selected"
              >
                <td class="col-check">
                  <input
                    type="checkbox"
                    [checked]="item.selected"
                    (click)="$event.stopPropagation()"
                    (change)="toggleItem(item)"
                    [attr.aria-label]="'เลือก ' + item.txId.slice(0, 8)"
                  />
                </td>
                <td>{{ item.txId.slice(0, 8) }}...</td>
                <td>{{ item.txType }}</td>
                <td class="col-amount">{{ item.originalAmount | number:'1.2-2' }}</td>
                <td class="col-amount">{{ item.remainingAmount | number:'1.2-2' }}</td>
                <td>
                  <span class="status-badge" [class]="'status-' + item.status.toLowerCase()">
                    {{ item.status }}
                  </span>
                </td>
                <td>{{ item.createdAt | date:'dd/MM/yyyy' }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: [`
    .selector-container { border: 1px solid #e0e0e0; border-radius: 4px; padding: 16px; }
    .selector-header { margin-bottom: 12px; }
    .selector-header h4 { margin: 0 0 8px 0; }
    .filter-row { display: flex; align-items: center; justify-content: space-between; }
    .filter-row label { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
    .item-count { font-size: 12px; color: #666; }
    .empty-state { text-align: center; color: #999; padding: 24px; }
    .open-items-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .open-items-table th, .open-items-table td { padding: 8px; border-bottom: 1px solid #eee; text-align: left; }
    .open-items-table th { background: #f9f9f9; font-weight: 500; }
    .open-items-table tbody tr { cursor: pointer; transition: background 0.15s; }
    .open-items-table tbody tr:hover { background: #f5f9ff; }
    .open-items-table tbody tr.selected { background: #e3f2fd; }
    .col-check { width: 40px; text-align: center; }
    .col-amount { text-align: right; }
    .status-badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
    .status-open { background: #fff3e0; color: #e65100; }
    .status-partial { background: #e3f2fd; color: #1565c0; }
    .status-closed { background: #e8f5e9; color: #2e7d32; }
  `],
})
export class OpenItemSelectorComponent {
  @Input() title = 'รายการค้างชำระ';
  @Input() set items(value: (ApOpenItemDetail | ArOpenItemDetail)[]) {
    this._items.set(value.map((item) => ({ ...item, selected: false })));
  }
  @Output() selectionChange = new EventEmitter<(ApOpenItemDetail | ArOpenItemDetail)[]>();

  private readonly _items = signal<OpenItemRow[]>([]);
  readonly showPartialOnly = signal(true);

  readonly filteredItems = computed(() => {
    const items = this._items();
    if (this.showPartialOnly()) {
      return items.filter((i) => i.status === ApArStatus.OPEN || i.status === ApArStatus.PARTIAL);
    }
    return items;
  });

  readonly allSelected = computed(() => {
    const filtered = this.filteredItems();
    return filtered.length > 0 && filtered.every((i) => i.selected);
  });

  togglePartialFilter(): void {
    this.showPartialOnly.update((v) => !v);
  }

  toggleItem(item: OpenItemRow): void {
    this._items.update((list) =>
      list.map((i) => (i.id === item.id ? { ...i, selected: !i.selected } : i))
    );
    this.emitSelection();
  }

  toggleAll(): void {
    const allCurrentlySelected = this.allSelected();
    const filteredIds = new Set(this.filteredItems().map((i) => i.id));
    this._items.update((list) =>
      list.map((i) => (filteredIds.has(i.id) ? { ...i, selected: !allCurrentlySelected } : i))
    );
    this.emitSelection();
  }

  private emitSelection(): void {
    const selected = this._items().filter((i) => i.selected);
    this.selectionChange.emit(selected);
  }
}
