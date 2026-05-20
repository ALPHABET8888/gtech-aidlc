import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TransactionsStateService } from '../../services/transactions-state.service';

/**
 * AP List Page — Displays AP open items with filtering and pagination.
 * US-026: View AP open items list.
 */
@Component({
  selector: 'app-ap-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h2>รายการเจ้าหนี้ (AP Open Items)</h2>
        <button class="btn-primary" (click)="goToPayment()">
          + บันทึกจ่ายเงิน
        </button>
      </div>

      <!-- Filters -->
      <div class="filter-bar">
        <div class="filter-group">
          <label for="vendorFilter">ผู้ขาย</label>
          <select id="vendorFilter" [(ngModel)]="filterVendorId" (ngModelChange)="onFilterChange()">
            <option value="">-- ทั้งหมด --</option>
            @for (vendor of state.activeVendors(); track vendor.id) {
              <option [value]="vendor.id">{{ vendor.code }} - {{ vendor.name }}</option>
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
      @if (state.apOpenItemsLoading()) {
        <div class="loading" aria-live="polite">กำลังโหลด...</div>
      }

      <!-- Table -->
      @if (!state.apOpenItemsLoading()) {
        @if (state.apOpenItems().length === 0) {
          <div class="empty-state">
            <p>ไม่พบรายการเจ้าหนี้</p>
          </div>
        } @else {
          <table class="data-table" aria-label="รายการเจ้าหนี้">
            <thead>
              <tr>
                <th>เอกสารอ้างอิง</th>
                <th>ประเภท TX</th>
                <th>ผู้ขาย</th>
                <th class="col-amount">ยอดเดิม (฿)</th>
                <th class="col-amount">ยอดคงเหลือ (฿)</th>
                <th>สถานะ</th>
                <th>วันที่สร้าง</th>
              </tr>
            </thead>
            <tbody>
              @for (item of state.apOpenItems(); track item.id) {
                <tr>
                  <td>{{ item.txId.slice(0, 8) }}...</td>
                  <td>{{ item.txType }}</td>
                  <td>{{ getVendorName(item.vendorId) }}</td>
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
              หน้า {{ state.apOpenItemsMeta().page }} / {{ state.apOpenItemsMeta().totalPages }}
              ({{ state.apOpenItemsMeta().total }} รายการ)
            </span>
            <div class="pagination-actions">
              <button
                class="btn-secondary"
                [disabled]="state.apOpenItemsMeta().page <= 1"
                (click)="goToPage(state.apOpenItemsMeta().page - 1)"
              >
                ← ก่อนหน้า
              </button>
              <button
                class="btn-secondary"
                [disabled]="state.apOpenItemsMeta().page >= state.apOpenItemsMeta().totalPages"
                (click)="goToPage(state.apOpenItemsMeta().page + 1)"
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
export class ApListComponent implements OnInit {
  readonly state = inject(TransactionsStateService);
  private readonly router = inject(Router);

  filterVendorId = '';
  filterStatus = '';

  ngOnInit(): void {
    this.loadData();
  }

  onFilterChange(): void {
    this.loadData();
  }

  goToPage(page: number): void {
    this.state.loadApOpenItems({
      page,
      vendorId: this.filterVendorId || undefined,
      status: this.filterStatus || undefined,
    });
  }

  goToPayment(): void {
    this.router.navigate(['/transactions/ap/payment']);
  }

  getVendorName(vendorId: string): string {
    const vendor = this.state.activeVendors().find((v) => v.id === vendorId);
    return vendor ? `${vendor.code} - ${vendor.name}` : vendorId.slice(0, 8) + '...';
  }

  private loadData(): void {
    this.state.loadApOpenItems({
      vendorId: this.filterVendorId || undefined,
      status: this.filterStatus || undefined,
    });
  }
}
