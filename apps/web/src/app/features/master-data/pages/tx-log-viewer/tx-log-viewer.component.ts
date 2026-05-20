import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe, SlicePipe } from '@angular/common';
import { TxApiService } from '../../services/tx-api.service';
import {
  TxLog,
  TxType,
  TxStatus,
  TxLogQueryParams,
  PaginatedResponse,
} from '../../models/master-data.models';

@Component({
  selector: 'app-tx-log-viewer',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, SlicePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <header class="page-header">
        <h2 class="page-title">Transaction Log</h2>
        <button
          class="btn btn-sm"
          (click)="toggleFilters()"
          [attr.aria-expanded]="showFilters()"
          aria-controls="filter-panel"
        >
          {{ showFilters() ? '▲ Hide Filters' : '▼ Show Filters' }}
        </button>
      </header>

      <!-- Advanced Filters Panel -->
      @if (showFilters()) {
        <div id="filter-panel" class="filter-panel" role="search" aria-label="Transaction filters">
          <div class="filter-grid">
            <div class="filter-group">
              <label for="filter-tx-type" class="filter-label">TX Type</label>
              <select
                id="filter-tx-type"
                class="filter-input"
                [ngModel]="filterTxType()"
                (ngModelChange)="filterTxType.set($event); applyFilters()"
              >
                <option value="">All Types</option>
                @for (type of txTypes; track type) {
                  <option [value]="type">{{ formatTxType(type) }}</option>
                }
              </select>
            </div>

            <div class="filter-group">
              <label for="filter-status" class="filter-label">Status</label>
              <select
                id="filter-status"
                class="filter-input"
                [ngModel]="filterStatus()"
                (ngModelChange)="filterStatus.set($event); applyFilters()"
              >
                <option value="">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="POSTED">Posted</option>
                <option value="VOIDED">Voided</option>
              </select>
            </div>

            <div class="filter-group">
              <label for="filter-period" class="filter-label">Period (YYYY-MM)</label>
              <input
                id="filter-period"
                type="month"
                class="filter-input"
                [ngModel]="filterPeriod()"
                (ngModelChange)="filterPeriod.set($event); applyFilters()"
                placeholder="YYYY-MM"
              />
            </div>

            <div class="filter-group">
              <label for="filter-item" class="filter-label">Item ID</label>
              <input
                id="filter-item"
                type="text"
                class="filter-input"
                [ngModel]="filterItem()"
                (ngModelChange)="filterItem.set($event)"
                (keyup.enter)="applyFilters()"
                placeholder="Enter item ID..."
              />
            </div>

            <div class="filter-group">
              <label for="filter-warehouse" class="filter-label">Warehouse ID</label>
              <input
                id="filter-warehouse"
                type="text"
                class="filter-input"
                [ngModel]="filterWarehouse()"
                (ngModelChange)="filterWarehouse.set($event)"
                (keyup.enter)="applyFilters()"
                placeholder="Enter warehouse ID..."
              />
            </div>

            <div class="filter-group">
              <label for="filter-date-from" class="filter-label">Date From</label>
              <input
                id="filter-date-from"
                type="date"
                class="filter-input"
                [ngModel]="filterDateFrom()"
                (ngModelChange)="filterDateFrom.set($event); applyFilters()"
              />
            </div>

            <div class="filter-group">
              <label for="filter-date-to" class="filter-label">Date To</label>
              <input
                id="filter-date-to"
                type="date"
                class="filter-input"
                [ngModel]="filterDateTo()"
                (ngModelChange)="filterDateTo.set($event); applyFilters()"
              />
            </div>

            <div class="filter-group filter-actions">
              <button class="btn btn-sm btn-primary" (click)="applyFilters()">Apply</button>
              <button class="btn btn-sm" (click)="resetFilters()">Reset</button>
            </div>
          </div>
        </div>
      }

      <!-- Loading state -->
      @if (txApi.loading()) {
        <div class="loading-indicator" role="status" aria-label="Loading transactions">
          <span class="spinner"></span>
          <span>Loading...</span>
        </div>
      }

      <!-- Error state -->
      @if (error()) {
        <div class="error-message" role="alert">
          <span>⚠️ {{ error() }}</span>
          <button class="btn btn-sm" (click)="loadTxLogs()">Retry</button>
        </div>
      }

      <!-- Table -->
      @if (!txApi.loading()) {
        <div class="table-container">
          <table class="data-table" aria-label="Transaction log list">
            <thead>
              <tr>
                <th class="col-expand"></th>
                <th>TX Code</th>
                <th>TX Type</th>
                <th>Status</th>
                <th>Item ID</th>
                <th>Warehouse ID</th>
                <th class="col-number">Qty</th>
                <th class="col-number">Total Cost</th>
                <th>Period</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              @if (txLogs().length === 0) {
                <tr>
                  <td colspan="10" class="empty-state">No transactions found</td>
                </tr>
              }
              @for (tx of txLogs(); track tx.id) {
                <tr
                  class="tx-row"
                  [class.expanded]="expandedTxId() === tx.id"
                  (click)="toggleExpand(tx.id)"
                  role="button"
                  [attr.aria-expanded]="expandedTxId() === tx.id"
                  tabindex="0"
                  (keyup.enter)="toggleExpand(tx.id)"
                  (keyup.space)="toggleExpand(tx.id)"
                >
                  <td class="col-expand">
                    <span class="expand-icon">{{ expandedTxId() === tx.id ? '▾' : '▸' }}</span>
                  </td>
                  <td class="cell-code">{{ tx.id | slice:0:8 }}...</td>
                  <td>
                    <span class="tx-type-badge">{{ formatTxType(tx.txType) }}</span>
                  </td>
                  <td>
                    <span
                      class="status-badge"
                      [class.draft]="tx.txStatus === 'DRAFT'"
                      [class.posted]="tx.txStatus === 'POSTED'"
                      [class.voided]="tx.txStatus === 'VOIDED'"
                    >
                      {{ tx.txStatus }}
                    </span>
                  </td>
                  <td class="cell-code">{{ tx.itemId ? (tx.itemId | slice:0:8) + '...' : '—' }}</td>
                  <td class="cell-code">{{ tx.warehouseId ? (tx.warehouseId | slice:0:8) + '...' : '—' }}</td>
                  <td class="col-number">{{ tx.qty !== null ? (tx.qty | number:'1.0-2') : '—' }}</td>
                  <td class="col-number">{{ tx.totalCost !== null ? (tx.totalCost | number:'1.2-2') : '—' }}</td>
                  <td>{{ tx.period }}</td>
                  <td>{{ tx.createdAt | date:'short' }}</td>
                </tr>

                <!-- Expanded Detail Row -->
                @if (expandedTxId() === tx.id) {
                  <tr class="detail-row">
                    <td colspan="10">
                      <div class="detail-panel">
                        <h4 class="detail-title">Transaction Details</h4>
                        <div class="detail-grid">
                          <!-- Identity -->
                          <div class="detail-section">
                            <h5 class="detail-section-title">Identity</h5>
                            <dl class="detail-list">
                              <dt>ID</dt>
                              <dd class="cell-code">{{ tx.id }}</dd>
                              <dt>TX Type</dt>
                              <dd>{{ formatTxType(tx.txType) }}</dd>
                              <dt>Status</dt>
                              <dd>
                                <span
                                  class="status-badge"
                                  [class.draft]="tx.txStatus === 'DRAFT'"
                                  [class.posted]="tx.txStatus === 'POSTED'"
                                  [class.voided]="tx.txStatus === 'VOIDED'"
                                >{{ tx.txStatus }}</span>
                              </dd>
                              <dt>TX Date</dt>
                              <dd>{{ tx.txDate | date:'medium' }}</dd>
                              <dt>Period</dt>
                              <dd>{{ tx.period }}</dd>
                            </dl>
                          </div>

                          <!-- Stock & Cost -->
                          <div class="detail-section">
                            <h5 class="detail-section-title">Stock & Cost</h5>
                            <dl class="detail-list">
                              <dt>Item ID</dt>
                              <dd class="cell-code">{{ tx.itemId || '—' }}</dd>
                              <dt>Warehouse ID</dt>
                              <dd class="cell-code">{{ tx.warehouseId || '—' }}</dd>
                              <dt>Qty</dt>
                              <dd>{{ tx.qty !== null ? (tx.qty | number:'1.0-2') : '—' }}</dd>
                              <dt>Unit Cost</dt>
                              <dd>{{ tx.unitCost !== null ? (tx.unitCost | number:'1.2-2') : '—' }}</dd>
                              <dt>Total Cost</dt>
                              <dd>{{ tx.totalCost !== null ? (tx.totalCost | number:'1.2-2') : '—' }}</dd>
                              <dt>COGS Unit</dt>
                              <dd>{{ tx.cogsUnit !== null ? (tx.cogsUnit | number:'1.2-2') : '—' }}</dd>
                            </dl>
                          </div>

                          <!-- Moving Average -->
                          <div class="detail-section">
                            <h5 class="detail-section-title">Moving Average</h5>
                            <dl class="detail-list">
                              <dt>MA Before</dt>
                              <dd>{{ tx.maBefore !== null ? (tx.maBefore | number:'1.2-2') : '—' }}</dd>
                              <dt>MA After</dt>
                              <dd>{{ tx.maAfter !== null ? (tx.maAfter | number:'1.2-2') : '—' }}</dd>
                              <dt>Stock Before</dt>
                              <dd>{{ tx.stockBefore !== null ? (tx.stockBefore | number:'1.0-2') : '—' }}</dd>
                              <dt>Stock After</dt>
                              <dd>{{ tx.stockAfter !== null ? (tx.stockAfter | number:'1.0-2') : '—' }}</dd>
                            </dl>
                          </div>

                          <!-- VAT & Amounts -->
                          <div class="detail-section">
                            <h5 class="detail-section-title">VAT & Amounts</h5>
                            <dl class="detail-list">
                              <dt>Base Amount</dt>
                              <dd>{{ tx.baseAmount !== null ? (tx.baseAmount | number:'1.2-2') : '—' }}</dd>
                              <dt>VAT Amount</dt>
                              <dd>{{ tx.vatAmount !== null ? (tx.vatAmount | number:'1.2-2') : '—' }}</dd>
                              <dt>VAT Type</dt>
                              <dd>{{ tx.vatType || '—' }}</dd>
                              <dt>AR Amount</dt>
                              <dd>{{ tx.arAmount !== null ? (tx.arAmount | number:'1.2-2') : '—' }}</dd>
                              <dt>AP Amount</dt>
                              <dd>{{ tx.apAmount !== null ? (tx.apAmount | number:'1.2-2') : '—' }}</dd>
                              <dt>AP/AR Status</dt>
                              <dd>{{ tx.apArStatus || '—' }}</dd>
                            </dl>
                          </div>

                          <!-- References -->
                          <div class="detail-section">
                            <h5 class="detail-section-title">References</h5>
                            <dl class="detail-list">
                              <dt>Vendor ID</dt>
                              <dd class="cell-code">{{ tx.vendorId || '—' }}</dd>
                              <dt>Customer ID</dt>
                              <dd class="cell-code">{{ tx.customerId || '—' }}</dd>
                              <dt>Parent TX ID</dt>
                              <dd class="cell-code">{{ tx.parentTxId || '—' }}</dd>
                              <dt>Ref JO ID</dt>
                              <dd class="cell-code">{{ tx.refJoId || '—' }}</dd>
                              <dt>Ref DO ID</dt>
                              <dd class="cell-code">{{ tx.refDoId || '—' }}</dd>
                              <dt>Ref Invoice ID</dt>
                              <dd class="cell-code">{{ tx.refInvoiceId || '—' }}</dd>
                              <dt>Ref GR ID</dt>
                              <dd class="cell-code">{{ tx.refGrId || '—' }}</dd>
                              <dt>Ref CN ID</dt>
                              <dd class="cell-code">{{ tx.refCnId || '—' }}</dd>
                              <dt>Tax Invoice No</dt>
                              <dd>{{ tx.taxInvoiceNo || '—' }}</dd>
                            </dl>
                          </div>

                          <!-- Audit -->
                          <div class="detail-section">
                            <h5 class="detail-section-title">Audit</h5>
                            <dl class="detail-list">
                              <dt>Created By</dt>
                              <dd>{{ tx.createdBy }}</dd>
                              <dt>Created At</dt>
                              <dd>{{ tx.createdAt | date:'medium' }}</dd>
                              <dt>Approved By</dt>
                              <dd>{{ tx.approvedBy || '—' }}</dd>
                              <dt>Approved At</dt>
                              <dd>{{ tx.approvedAt ? (tx.approvedAt | date:'medium') : '—' }}</dd>
                              <dt>Reason</dt>
                              <dd>{{ tx.reason || '—' }}</dd>
                            </dl>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        @if (pagination()) {
          <div class="pagination-bar">
            <span class="pagination-info">
              Showing {{ paginationStart() }}–{{ paginationEnd() }} of {{ pagination()!.total }}
            </span>
            <div class="pagination-controls">
              <button
                class="btn btn-sm"
                [disabled]="currentPage() <= 1"
                (click)="goToPage(currentPage() - 1)"
                aria-label="Previous page"
              >‹ Prev</button>
              @for (page of visiblePages(); track page) {
                <button
                  class="btn btn-sm"
                  [class.btn-active]="page === currentPage()"
                  (click)="goToPage(page)"
                  [attr.aria-label]="'Page ' + page"
                  [attr.aria-current]="page === currentPage() ? 'page' : null"
                >{{ page }}</button>
              }
              <button
                class="btn btn-sm"
                [disabled]="currentPage() >= totalPages()"
                (click)="goToPage(currentPage() + 1)"
                aria-label="Next page"
              >Next ›</button>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .page-title { margin: 0; font-size: 20px; font-weight: 600; color: #212121; }

    /* Filter Panel */
    .filter-panel {
      background: #f9fafb;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .filter-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      align-items: end;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .filter-label {
      font-size: 12px;
      font-weight: 500;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .filter-input {
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 14px;
      color: #424242;
      background: #ffffff;

      &:focus {
        outline: none;
        border-color: #1565c0;
        box-shadow: 0 0 0 2px rgba(21, 101, 192, 0.1);
      }
    }

    .filter-actions {
      display: flex;
      flex-direction: row;
      gap: 8px;
      align-items: flex-end;
      padding-top: 18px;
    }

    /* Loading & Error */
    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 24px;
      color: #616161;
      font-size: 14px;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #e0e0e0;
      border-top-color: #1565c0;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .error-message {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 4px;
      color: #991b1b;
      margin-bottom: 16px;
      font-size: 14px;
    }

    /* Table */
    .table-container {
      overflow-x: auto;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background: #ffffff;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;

      th, td {
        padding: 10px 14px;
        text-align: left;
        border-bottom: 1px solid #f0f0f0;
      }

      th {
        background: #f9fafb;
        font-weight: 600;
        color: #374151;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      tbody tr.tx-row {
        cursor: pointer;
        transition: background-color 0.1s;

        &:hover { background-color: #f8fafc; }
        &.expanded { background-color: #eff6ff; }
      }

      tbody tr:last-child td { border-bottom: none; }
    }

    .col-expand { width: 32px; text-align: center; }
    .col-number { text-align: right; }

    .expand-icon { font-size: 12px; color: #6b7280; }

    .cell-code { font-family: monospace; font-size: 13px; }

    .empty-state {
      text-align: center;
      color: #9ca3af;
      padding: 40px 16px !important;
      font-style: italic;
    }

    /* Status Badges */
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.3px;

      &.draft { background: #fef9c3; color: #854d0e; }
      &.posted { background: #dcfce7; color: #166534; }
      &.voided { background: #fee2e2; color: #991b1b; }
    }

    .tx-type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      background: #e0e7ff;
      color: #3730a3;
      letter-spacing: 0.2px;
    }

    /* Detail Panel */
    .detail-row td {
      padding: 0 !important;
      background: #fafbfc;
      border-bottom: 2px solid #e0e0e0;
    }

    .detail-panel {
      padding: 20px 24px;
    }

    .detail-title {
      margin: 0 0 16px 0;
      font-size: 15px;
      font-weight: 600;
      color: #212121;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }

    .detail-section {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 12px 16px;
    }

    .detail-section-title {
      margin: 0 0 8px 0;
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .detail-list {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
      margin: 0;
      font-size: 13px;

      dt {
        color: #6b7280;
        font-weight: 500;
        white-space: nowrap;
      }

      dd {
        margin: 0;
        color: #1f2937;
        word-break: break-all;
      }
    }

    /* Pagination */
    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      margin-top: 12px;
    }

    .pagination-info { font-size: 13px; color: #6b7280; }

    .pagination-controls { display: flex; gap: 4px; }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 16px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      background: #ffffff;
      color: #374151;
      text-decoration: none;
      transition: all 0.15s;

      &:hover:not(:disabled) { background: #f9fafb; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-primary {
      background: #1565c0; color: #ffffff; border-color: #1565c0;
      &:hover:not(:disabled) { background: #0d47a1; }
    }
    .btn-active {
      background: #1565c0; color: #ffffff; border-color: #1565c0;
    }
  `],
})
export class TxLogViewerComponent implements OnInit {
  protected readonly txApi = inject(TxApiService);

  // TX type options
  readonly txTypes: TxType[] = [
    'SALE_INVOICE', 'TEMP_DO', 'JOB_ORDER',
    'GR_RECEIVE', 'GR_RETURN', 'GR_REPLACEMENT',
    'CN_SALES_RETURN', 'CN_SALES_PRICE', 'CN_RETURN', 'CN_PRICE_ADJ',
    'AP_CN_DEBT', 'AP_PAYMENT', 'AR_RECEIVE',
    'ADJ_COUNT_UP', 'ADJ_COUNT_DOWN', 'ADJ_TRANSFER', 'ADJ_WRITEOFF',
    'VOID',
  ];

  // Filter state
  readonly showFilters = signal(true);
  readonly filterTxType = signal<string>('');
  readonly filterStatus = signal<string>('');
  readonly filterPeriod = signal<string>('');
  readonly filterItem = signal<string>('');
  readonly filterWarehouse = signal<string>('');
  readonly filterDateFrom = signal<string>('');
  readonly filterDateTo = signal<string>('');

  // Data state
  readonly txLogs = signal<TxLog[]>([]);
  readonly pagination = signal<{ page: number; pageSize: number; total: number; totalPages: number } | null>(null);
  readonly error = signal<string | null>(null);
  readonly expandedTxId = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);

  // Computed
  readonly totalPages = computed(() => this.pagination()?.totalPages ?? 1);

  readonly paginationStart = computed(() => {
    const p = this.pagination();
    if (!p || p.total === 0) return 0;
    return (p.page - 1) * p.pageSize + 1;
  });

  readonly paginationEnd = computed(() => {
    const p = this.pagination();
    if (!p) return 0;
    return Math.min(p.page * p.pageSize, p.total);
  });

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, current - Math.floor(maxVisible / 2));
    const end = Math.min(total, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });

  ngOnInit(): void {
    this.loadTxLogs();
  }

  toggleFilters(): void {
    this.showFilters.set(!this.showFilters());
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadTxLogs();
  }

  resetFilters(): void {
    this.filterTxType.set('');
    this.filterStatus.set('');
    this.filterPeriod.set('');
    this.filterItem.set('');
    this.filterWarehouse.set('');
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.currentPage.set(1);
    this.loadTxLogs();
  }

  loadTxLogs(): void {
    this.error.set(null);

    const params: TxLogQueryParams = {
      page: this.currentPage(),
      pageSize: this.pageSize(),
    };

    const txType = this.filterTxType();
    if (txType) params.txType = txType as TxType;

    const status = this.filterStatus();
    if (status) params.txStatus = status as TxStatus;

    const period = this.filterPeriod();
    if (period) params.period = period;

    const item = this.filterItem().trim();
    if (item) params.itemId = item;

    const warehouse = this.filterWarehouse().trim();
    if (warehouse) params.warehouseId = warehouse;

    const dateFrom = this.filterDateFrom();
    if (dateFrom) params.dateFrom = dateFrom;

    const dateTo = this.filterDateTo();
    if (dateTo) params.dateTo = dateTo;

    this.txApi.getAll(params).subscribe({
      next: (response: PaginatedResponse<TxLog>) => {
        this.txLogs.set(response.data);
        this.pagination.set(response.pagination);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load transactions');
      },
    });
  }

  toggleExpand(txId: string): void {
    this.expandedTxId.set(this.expandedTxId() === txId ? null : txId);
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadTxLogs();
  }

  formatTxType(type: string): string {
    return type.replace(/_/g, ' ');
  }
}
