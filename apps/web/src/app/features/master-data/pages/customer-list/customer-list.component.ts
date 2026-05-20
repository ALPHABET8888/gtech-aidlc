import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CustomerApiService } from '../../services/customer-api.service';
import { Customer, PaginatedResponse } from '../../models/master-data.models';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <header class="page-header">
        <h2 class="page-title">Customers</h2>
        <a routerLink="new" class="btn btn-primary">+ New Customer</a>
      </header>

      <!-- Search & Filter -->
      <div class="filter-bar">
        <input
          type="text"
          class="filter-input search-input"
          placeholder="Search by name, code or tax ID..."
          [ngModel]="searchTerm()"
          (ngModelChange)="onSearchChange($event)"
        />
        <select
          class="filter-input"
          [ngModel]="statusFilter()"
          (ngModelChange)="onStatusChange($event)"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <!-- Loading state -->
      @if (customerApi.loading()) {
        <div class="loading-indicator" role="status" aria-label="Loading customers">
          <span class="spinner"></span>
          <span>Loading...</span>
        </div>
      }

      <!-- Error state -->
      @if (customerApi.error()) {
        <div class="error-message" role="alert">
          <span>⚠️ {{ customerApi.error() }}</span>
          <button class="btn btn-sm" (click)="loadCustomers()">Retry</button>
        </div>
      }

      <!-- Table -->
      @if (!customerApi.loading()) {
        <div class="table-container">
          <table class="data-table" aria-label="Customers list">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Contact</th>
                <th>Tax ID</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @if (customers().length === 0) {
                <tr>
                  <td colspan="6" class="empty-state">No customers found</td>
                </tr>
              }
              @for (customer of customers(); track customer.id) {
                <tr>
                  <td class="cell-code">{{ customer.code }}</td>
                  <td>{{ customer.name }}</td>
                  <td class="cell-contact">
                    @if (customer.phone || customer.email) {
                      <span>{{ customer.phone || customer.email }}</span>
                    } @else {
                      <span class="text-muted">—</span>
                    }
                  </td>
                  <td>{{ customer.taxId || '—' }}</td>
                  <td>
                    <span
                      class="status-badge"
                      [class.active]="customer.isActive"
                      [class.inactive]="!customer.isActive"
                    >
                      {{ customer.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="cell-actions">
                    <a
                      [routerLink]="[customer.id, 'edit']"
                      class="btn btn-sm btn-outline"
                      aria-label="Edit customer"
                    >Edit</a>
                    <button
                      class="btn btn-sm btn-danger"
                      (click)="deleteCustomer(customer)"
                      [disabled]="!customer.isActive"
                      [attr.aria-label]="'Deactivate ' + customer.name"
                    >Deactivate</button>
                  </td>
                </tr>
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
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .page-title { margin: 0; font-size: 20px; font-weight: 600; color: #212121; }
    .filter-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .filter-input {
      padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; color: #424242; background: #ffffff;
      &:focus { outline: none; border-color: #1565c0; box-shadow: 0 0 0 2px rgba(21, 101, 192, 0.1); }
    }
    .search-input { flex: 1; min-width: 200px; }
    .loading-indicator { display: flex; align-items: center; gap: 8px; padding: 24px; color: #616161; font-size: 14px; }
    .spinner { width: 16px; height: 16px; border: 2px solid #e0e0e0; border-top-color: #1565c0; border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .error-message { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; color: #991b1b; margin-bottom: 16px; font-size: 14px; }
    .table-container { overflow-x: auto; border: 1px solid #e0e0e0; border-radius: 6px; background: #ffffff; }
    .data-table {
      width: 100%; border-collapse: collapse; font-size: 14px;
      th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #f0f0f0; }
      th { background: #f9fafb; font-weight: 600; color: #374151; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
      tbody tr:hover { background-color: #f8fafc; }
      tbody tr:last-child td { border-bottom: none; }
    }
    .cell-code { font-family: monospace; font-weight: 500; }
    .cell-contact { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cell-actions { display: flex; gap: 8px; }
    .text-muted { color: #9ca3af; }
    .empty-state { text-align: center; color: #9ca3af; padding: 40px 16px !important; font-style: italic; }
    .status-badge {
      display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500;
      &.active { background: #dcfce7; color: #166534; }
      &.inactive { background: #f3f4f6; color: #6b7280; }
    }
    .pagination-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; margin-top: 12px; }
    .pagination-info { font-size: 13px; color: #6b7280; }
    .pagination-controls { display: flex; gap: 4px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; background: #ffffff; color: #374151; text-decoration: none; transition: all 0.15s;
      &:hover:not(:disabled) { background: #f9fafb; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-primary { background: #1565c0; color: #ffffff; border-color: #1565c0; &:hover:not(:disabled) { background: #0d47a1; } }
    .btn-outline { border-color: #1565c0; color: #1565c0; &:hover:not(:disabled) { background: #e3f2fd; } }
    .btn-danger { border-color: #dc2626; color: #dc2626; &:hover:not(:disabled) { background: #fef2f2; } }
    .btn-active { background: #1565c0; color: #ffffff; border-color: #1565c0; }
  `],
})
export class CustomerListComponent implements OnInit {
  private readonly router = inject(Router);
  protected readonly customerApi = inject(CustomerApiService);

  // State
  readonly customers = signal<Customer[]>([]);
  readonly pagination = signal<{ page: number; pageSize: number; total: number; totalPages: number } | null>(null);
  readonly searchTerm = signal('');
  readonly statusFilter = signal('');
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
    this.loadCustomers();
  }

  loadCustomers(): void {
    const params: Record<string, unknown> = {
      page: this.currentPage(),
      pageSize: this.pageSize(),
    };

    const search = this.searchTerm().trim();
    if (search) {
      params['search'] = search;
    }

    const status = this.statusFilter();
    if (status) {
      params['isActive'] = status;
    }

    this.customerApi.getAll(params).subscribe({
      next: (response: PaginatedResponse<Customer>) => {
        this.customers.set(response.data);
        this.pagination.set(response.pagination);
      },
      error: (err) => {
        this.customerApi.error.set(err?.error?.message || 'Failed to load customers');
      },
    });
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
    this.loadCustomers();
  }

  onStatusChange(value: string): void {
    this.statusFilter.set(value);
    this.currentPage.set(1);
    this.loadCustomers();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadCustomers();
  }

  deleteCustomer(customer: Customer): void {
    if (!confirm(`Are you sure you want to deactivate "${customer.name}"?`)) return;

    this.customerApi.delete(customer.id).subscribe({
      next: () => this.loadCustomers(),
      error: (err) => {
        this.customerApi.error.set(err?.error?.message || 'Failed to deactivate customer');
      },
    });
  }
}
