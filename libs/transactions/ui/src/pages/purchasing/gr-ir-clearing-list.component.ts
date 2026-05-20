import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransactionsStateService } from '../../services/transactions-state.service';

/**
 * GR/IR Clearing List Page — Displays clearing entries with status and PPV.
 * Supports filtering by vendor and status, with pagination.
 */
@Component({
  selector: 'app-gr-ir-clearing-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container">
      <h2>GR/IR Clearing</h2>
      <p class="subtitle">รายการ Clearing จากการคืนสินค้า — ติดตามสถานะ OPEN/CLOSED</p>

      <!-- Filters -->
      <div class="filters">
        <div class="filter-group">
          <label for="filterVendor">ผู้ขาย</label>
          <select id="filterVendor" [(ngModel)]="filterVendorId" (ngModelChange)="loadClearings()">
            <option value="">-- ทั้งหมด --</option>
            @for (vendor of state.activeVendors(); track vendor.id) {
              <option [value]="vendor.id">{{ vendor.code }} - {{ vendor.name }}</option>
            }
          </select>
        </div>
        <div class="filter-group">
          <label for="filterStatus">สถานะ</label>
          <select id="filterStatus" [(ngModel)]="filterStatus" (ngModelChange)="loadClearings()">
            <option value="">-- ทั้งหมด --</option>
            <option value="OPEN">OPEN</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
      </div>

      <!-- Loading -->
      @if (state.clearingsLoading()) {
        <div class="loading" aria-live="polite">กำลังโหลด...</div>
      }

      <!-- Table -->
      @if (!state.clearingsLoading()) {
        <table class="data-table" aria-label="รายการ GR/IR Clearing">
          <thead>
            <tr>
              <th>Clearing ID</th>
              <th>GR Return TX</th>
              <th>ผู้ขาย</th>
              <th>ยอด Clearing (฿)</th>
              <th>สถานะ</th>
              <th>PPV (฿)</th>
              <th>วันที่สร้าง</th>
            </tr>
          </thead>
          <tbody>
            @for (clearing of state.clearings(); track clearing.id) {
              <tr>
                <td class="mono">{{ clearing.id | slice:0:8 }}...</td>
                <td class="mono">{{ clearing.grReturnTxId | slice:0:8 }}...</td>
                <td>{{ getVendorName(clearing.vendorId) }}</td>
                <td class="text-right">{{ clearing.clearingAmount | number:'1.2-2' }}</td>
                <td>
                  <span class="badge" [class.badge-open]="clearing.status === 'OPEN'" [class.badge-closed]="clearing.status === 'CLOSED'">
                    {{ clearing.status }}
                  </span>
                </td>
                <td class="text-right">
                  @if (clearing.ppvAmount !== null) {
                    <span [class.ppv-positive]="clearing.ppvAmount > 0" [class.ppv-negative]="clearing.ppvAmount < 0">
                      {{ clearing.ppvAmount | number:'1.2-2' }}
                    </span>
                  } @else {
                    <span class="text-muted">—</span>
                  }
                </td>
                <td>{{ clearing.createdAt | date:'dd/MM/yyyy HH:mm' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="empty-state">ไม่พบรายการ Clearing</td>
              </tr>
            }
          </tbody>
        </table>

        <!-- Pagination -->
        @if (state.clearingsMeta().totalPages > 1) {
          <div class="pagination" aria-label="การแบ่งหน้า">
            <button
              class="btn-page"
              [disabled]="currentPage() <= 1"
              (click)="goToPage(currentPage() - 1)"
              aria-label="หน้าก่อน"
            >
              ← ก่อนหน้า
            </button>
            <span class="page-info">
              หน้า {{ currentPage() }} / {{ state.clearingsMeta().totalPages }}
              ({{ state.clearingsMeta().total }} รายการ)
            </span>
            <button
              class="btn-page"
              [disabled]="currentPage() >= state.clearingsMeta().totalPages"
              (click)="goToPage(currentPage() + 1)"
              aria-label="หน้าถัดไป"
            >
              ถัดไป →
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page-container { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h2 { margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; }
    .filters { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .filter-group { display: flex; flex-direction: column; gap: 4px; }
    .filter-group label { font-size: 12px; font-weight: 500; color: #666; }
    .filter-group select { padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; min-width: 200px; }
    .loading { padding: 40px; text-align: center; color: #666; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { padding: 10px 12px; border: 1px solid #e0e0e0; text-align: left; font-size: 14px; }
    .data-table th { background: #f5f5f5; font-weight: 500; white-space: nowrap; }
    .data-table tbody tr:hover { background: #fafafa; }
    .mono { font-family: monospace; font-size: 12px; }
    .text-right { text-align: right; }
    .text-muted { color: #999; }
    .badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
    .badge-open { background: #fff3e0; color: #e65100; }
    .badge-closed { background: #e8f5e9; color: #2e7d32; }
    .ppv-positive { color: #d32f2f; }
    .ppv-negative { color: #2e7d32; }
    .empty-state { text-align: center; color: #999; padding: 40px; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 20px; padding: 16px 0; }
    .btn-page { padding: 8px 16px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font-size: 14px; }
    .btn-page:disabled { color: #ccc; cursor: not-allowed; }
    .btn-page:hover:not(:disabled) { background: #f5f5f5; }
    .page-info { font-size: 14px; color: #666; }
  `],
})
export class GrIrClearingListComponent implements OnInit {
  readonly state = inject(TransactionsStateService);

  filterVendorId = '';
  filterStatus = '';
  readonly currentPage = signal(1);

  ngOnInit(): void {
    this.state.loadMasterData();
    this.loadClearings();
  }

  loadClearings(): void {
    this.currentPage.set(1);
    this.state.loadClearings({
      page: this.currentPage(),
      limit: 20,
      vendorId: this.filterVendorId || undefined,
      status: this.filterStatus || undefined,
    });
  }

  goToPage(page: number): void {
    this.currentPage.set(page);
    this.state.loadClearings({
      page,
      limit: 20,
      vendorId: this.filterVendorId || undefined,
      status: this.filterStatus || undefined,
    });
  }

  getVendorName(vendorId: string): string {
    const vendor = this.state.activeVendors().find((v) => v.id === vendorId);
    return vendor ? `${vendor.code} - ${vendor.name}` : vendorId.slice(0, 8) + '...';
  }
}
