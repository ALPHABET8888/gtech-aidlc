import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TransactionsStateService } from '../../services/transactions-state.service';

/**
 * AR List Page — Displays AR open items with filtering and pagination.
 * US-027: View AR open items list.
 */
@Component({
  selector: 'app-ar-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h2>รายการลูกหนี้ (AR Open Items)</h2>
        <button class="btn-primary" (click)="goToPayment()">
          + บันทึกรับเงิน
        </button>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <div class="filter-group">
          <label for="customerFilter">ลูกค้า</label>
          <select id="customerFilter" [(ngModel)]="filterCustomerId" (ngModelChange)="onFilterChange()">
            <option value="">-- ทั้งหมด --</option>
            @for (customer of state.activeCustomers(); track customer.id) {
              <option [value]="customer.id">{{ customer.code }} - {{ customer.name }}</option>
            }
          </select>
        </div>
        <div class="filter-group">
          <label for="statusFilter">สถานะ</label>
          <select id="statusFilter" [(ngModel)]="filterStatus" (ngModelChange)="onFilterChange()">
            <option value="">-- ทั้งหมด --</option>
            <option value="OPEN">OPEN</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
      </div>

      <!-- Loading -->
      @if (state.arOpenItemsLoading()) {
        <div class="loading" aria-live="polite">กำลังโหลด...</div>
      }

      <!-- Table -->
      @if (!state.arOpenItemsLoading()) {
        @if (state.arOpenItems().length === 0) {
          <div class="empty-state">
            <p>ไม่พบรายการลูกหนี้</p>
          </div>
        } @else {
          <table class="data-table" aria-label="รายการลูกหนี้">
            <thead>
              <tr>
                <th>เอกสารอ้างอิง</th>
                <th>ประเภท TX</th>
                <th>ลูกค้า</th>
                <th class="col-amount">ยอดเดิม (฿)</th>
                <th class="col-amount">ยอดคงเหลือ (฿)</th>
                <th>สถานะ</th>
                <th>วันที่สร้าง</th>
              </tr>
            </thead>
            <tbody>
              @for (item of state.arOpenItems(); track item.id) {
                <tr>
                  <td>{{ item.refTxId.slice(0, 8) }}...</td>
                  <td>{{ item.refTxType }}</td>
                  <td>{{ getCustomerName(item.customerId) }}</td>
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

          <!-- Pagination -->
          <div class="pagination">
            <span>
              หน้า {{ state.arOpenItemsMeta().page }} / {{ state.arOpenItemsMeta().totalPages }}
              ({{ state.arOpenItemsMeta().total }} รายการ)
            </span>
            <div class="pagination-actions">
              <button
                class="btn-secondary"
                [disabled]="state.arOpenItemsMeta().page <= 1"
                (click)="goToPage(state.arOpenItemsMeta().page - 1)"
              >
                ← ก่อนหน้า
              </button>
              <button
                class="btn-secondary"
                [disabled]="state.arOpenItemsMeta().page >= state.arOpenItemsMeta().totalPages"
                (click)="goToPage(state.arOpenItemsMeta().page + 1)"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page-container { max-width: 1000px; margin: 0 auto; padding: 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .page-header h2 { margin: 0; }
    .filter-bar { display: flex; gap: 16px; margin-bottom: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px; }
    .filter-group { display: flex; flex-direction: column; gap: 4px; }
    .filter-group label { font-size: 12px; font-weight: 500; color: #666; }
    .filter-group select { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; min-width: 200px; }
    .loading { text-align: center; padding: 40px; color: #666; }
    .empty-state { text-align: center; padding: 40px; color: #999; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th, .data-table td { padding: 10px 8px; border-bottom: 1px solid #eee; text-align: left; }
    .data-table th { background: #f5f5f5; font-weight: 500; }
    .data-table tbody tr:hover { background: #fafafa; }
    .col-amount { text-align: right; }
    .status-badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
    .status-open { background: #fff3e0; color: #e65100; }
    .status-partial { background: #e3f2fd; color: #1565c0; }
    .status-closed { background: #e8f5e9; color: #2e7d32; }
    .pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee; }
    .pagination span { font-size: 13px; color: #666; }
    .pagination-actions { display: flex; gap: 8px; }
    .btn-primary { padding: 8px 16px; background: #1976d2; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .btn-primary:hover { background: #1565c0; }
    .btn-secondary { padding: 6px 12px; background: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class ArListComponent implements OnInit {
  readonly state = inject(TransactionsStateService);
  private readonly router = inject(Router);

  filterCustomerId = '';
  filterStatus = '';

  ngOnInit(): void {
    this.loadData();
  }

  onFilterChange(): void {
    this.loadData();
  }

  goToPage(page: number): void {
    this.state.loadArOpenItems({
      page,
      customerId: this.filterCustomerId || undefined,
      status: this.filterStatus || undefined,
    });
  }

  goToPayment(): void {
    this.router.navigate(['/transactions/ar/payment']);
  }

  getCustomerName(customerId: string): string {
    const customer = this.state.activeCustomers().find((c) => c.id === customerId);
    return customer ? `${customer.code} - ${customer.name}` : customerId.slice(0, 8) + '...';
  }

  private loadData(): void {
    this.state.loadArOpenItems({
      customerId: this.filterCustomerId || undefined,
      status: this.filterStatus || undefined,
    });
  }
}
