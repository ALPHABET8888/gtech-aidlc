import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TransactionsStateService } from '../../services/transactions-state.service';
import { JOStatus } from '../../models';

/**
 * Job Order List page — displays paginated list of job orders with status filter.
 * Stories: US-008
 */
@Component({
  selector: 'app-job-order-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="page-header">
      <h1>Job Orders</h1>
      <a routerLink="/transactions/job-orders/create" class="btn btn-primary">
        + Create Job Order
      </a>
    </div>

    <!-- Filters -->
    <div class="filters">
      <label for="statusFilter">Status:</label>
      <select id="statusFilter" [(ngModel)]="statusFilter" (ngModelChange)="onFilterChange()">
        <option value="">All</option>
        <option value="OPEN">Open</option>
        <option value="IN_PROGRESS">In Progress</option>
        <option value="DONE">Done</option>
      </select>
    </div>

    <!-- Loading -->
    @if (state.jobOrdersLoading()) {
      <div class="loading">Loading job orders...</div>
    }

    <!-- Error -->
    @if (state.jobOrdersError()) {
      <div class="alert alert-error">{{ state.jobOrdersError() }}</div>
    }

    <!-- Table -->
    @if (!state.jobOrdersLoading() && state.hasJobOrders()) {
      <table class="data-table">
        <thead>
          <tr>
            <th>JO Number</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Grand Total</th>
            <th>TEMP DO</th>
            <th>Invoice</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (jo of state.jobOrders(); track jo.id) {
            <tr>
              <td>
                <a [routerLink]="['/transactions/job-orders', jo.id]">{{ jo.joNumber }}</a>
              </td>
              <td>{{ jo.customerId | slice:0:8 }}...</td>
              <td>
                <span class="badge" [class]="'badge-' + jo.status.toLowerCase()">
                  {{ jo.status }}
                </span>
              </td>
              <td class="text-right">{{ jo.grandTotal | number:'1.2-2' }}</td>
              <td>{{ jo.hasTempDo ? '✓' : '—' }}</td>
              <td>{{ jo.invoiceId ? '✓' : '—' }}</td>
              <td>{{ jo.createdAt | date:'short' }}</td>
              <td>
                <a [routerLink]="['/transactions/job-orders', jo.id]" class="btn btn-sm">
                  View
                </a>
              </td>
            </tr>
          }
        </tbody>
      </table>

      <!-- Pagination -->
      <div class="pagination">
        <button
          [disabled]="state.jobOrdersMeta().page <= 1"
          (click)="goToPage(state.jobOrdersMeta().page - 1)">
          Previous
        </button>
        <span>
          Page {{ state.jobOrdersMeta().page }} of {{ state.jobOrdersMeta().totalPages }}
          ({{ state.jobOrdersMeta().total }} total)
        </span>
        <button
          [disabled]="state.jobOrdersMeta().page >= state.jobOrdersMeta().totalPages"
          (click)="goToPage(state.jobOrdersMeta().page + 1)">
          Next
        </button>
      </div>
    }

    <!-- Empty State -->
    @if (!state.jobOrdersLoading() && !state.hasJobOrders() && !state.jobOrdersError()) {
      <div class="empty-state">
        <p>No job orders found.</p>
        <a routerLink="/transactions/job-orders/create" class="btn btn-primary">
          Create your first Job Order
        </a>
      </div>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .filters { margin-bottom: 1rem; display: flex; gap: 0.5rem; align-items: center; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td { padding: 0.5rem; border-bottom: 1px solid #e2e8f0; text-align: left; }
    .data-table th { font-weight: 600; background: #f7fafc; }
    .text-right { text-align: right; }
    .badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .badge-open { background: #bee3f8; color: #2a4365; }
    .badge-in_progress { background: #fefcbf; color: #744210; }
    .badge-done { background: #c6f6d5; color: #22543d; }
    .pagination { display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1rem; }
    .btn { padding: 0.5rem 1rem; border: 1px solid #cbd5e0; border-radius: 4px; cursor: pointer; text-decoration: none; color: inherit; }
    .btn-primary { background: #3182ce; color: white; border-color: #3182ce; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; }
    .alert-error { background: #fed7d7; color: #9b2c2c; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .loading { padding: 2rem; text-align: center; color: #718096; }
    .empty-state { padding: 2rem; text-align: center; color: #718096; }
  `],
})
export class JobOrderListComponent implements OnInit {
  readonly state = inject(TransactionsStateService);

  statusFilter = '';

  ngOnInit(): void {
    this.loadData();
  }

  onFilterChange(): void {
    this.loadData();
  }

  goToPage(page: number): void {
    this.loadData(page);
  }

  private loadData(page = 1): void {
    this.state.loadJobOrders({
      page,
      limit: 20,
      status: this.statusFilter || undefined,
      sort: 'createdAt:desc',
    });
  }
}
