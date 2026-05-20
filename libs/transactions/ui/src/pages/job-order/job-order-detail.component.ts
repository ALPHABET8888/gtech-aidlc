import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TransactionsStateService } from '../../services/transactions-state.service';
import { JOStatus } from '../../models';

/**
 * Job Order Detail page — shows JO details, status transitions, and invoice/TEMP_DO actions.
 * Stories: US-008, US-009, US-010, US-011
 */
@Component({
  selector: 'app-job-order-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-header">
      <h1>Job Order Detail</h1>
      <a routerLink="/transactions/job-orders" class="btn">← Back to List</a>
    </div>

    <!-- Loading -->
    @if (state.selectedJobOrderLoading()) {
      <div class="loading">Loading job order...</div>
    }

    <!-- Error -->
    @if (state.selectedJobOrderError()) {
      <div class="alert alert-error">{{ state.selectedJobOrderError() }}</div>
    }

    <!-- Success -->
    @if (state.submitSuccess()) {
      <div class="alert alert-success">{{ state.submitSuccess() }}</div>
    }

    <!-- Submit Error -->
    @if (state.submitError()) {
      <div class="alert alert-error">{{ state.submitError() }}</div>
    }

    <!-- Detail -->
    @if (state.selectedJobOrder(); as jo) {
      <div class="detail-card">
        <div class="detail-header">
          <h2>{{ jo.joNumber }}</h2>
          <span class="badge" [class]="'badge-' + jo.status.toLowerCase()">
            {{ jo.status }}
          </span>
        </div>

        <div class="detail-grid">
          <div class="detail-field">
            <label>Customer ID</label>
            <span>{{ jo.customerId }}</span>
          </div>
          <div class="detail-field">
            <label>Total Amount</label>
            <span>{{ jo.totalAmount | number:'1.2-2' }} THB</span>
          </div>
          <div class="detail-field">
            <label>VAT</label>
            <span>{{ jo.vatAmount | number:'1.2-2' }} THB</span>
          </div>
          <div class="detail-field">
            <label>Grand Total</label>
            <span class="text-bold">{{ jo.grandTotal | number:'1.2-2' }} THB</span>
          </div>
          <div class="detail-field">
            <label>Has TEMP DO</label>
            <span>{{ jo.hasTempDo ? 'Yes' : 'No' }}</span>
          </div>
          <div class="detail-field">
            <label>Invoice</label>
            <span>{{ jo.invoiceId ? jo.invoiceId : 'Not issued' }}</span>
          </div>
          <div class="detail-field">
            <label>Created</label>
            <span>{{ jo.createdAt | date:'medium' }}</span>
          </div>
          @if (jo.notes) {
            <div class="detail-field full-width">
              <label>Notes</label>
              <span>{{ jo.notes }}</span>
            </div>
          }
        </div>

        <!-- Items Table -->
        <h3>Items</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Subtotal</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            @for (item of jo.items; track item.itemId) {
              <tr>
                <td>{{ item.itemId | slice:0:8 }}...</td>
                <td class="text-right">{{ item.qty }}</td>
                <td class="text-right">{{ item.unitPrice | number:'1.2-2' }}</td>
                <td class="text-right">{{ item.qty * item.unitPrice | number:'1.2-2' }}</td>
                <td>{{ item.description || '—' }}</td>
              </tr>
            }
          </tbody>
        </table>

        <!-- Actions -->
        <div class="actions-section">
          <h3>Actions</h3>

          <!-- Status Transitions -->
          @if (jo.status === 'OPEN') {
            <button
              class="btn btn-primary"
              (click)="updateStatus('IN_PROGRESS')"
              [disabled]="state.submitting()">
              Start → IN_PROGRESS
            </button>
          }
          @if (jo.status === 'IN_PROGRESS') {
            <button
              class="btn btn-primary"
              (click)="updateStatus('DONE')"
              [disabled]="state.submitting()">
              Complete → DONE
            </button>
          }

          <!-- Invoice Actions (only when DONE) -->
          @if (jo.status === 'DONE') {
            @if (state.canIssueTempDo()) {
              <a
                [routerLink]="['/transactions/sales/invoice/create']"
                [queryParams]="{ joId: jo.id, mode: 'temp-do' }"
                class="btn btn-secondary">
                Issue TEMP_DO
              </a>
            }
            @if (state.canIssueInvoice()) {
              <a
                [routerLink]="['/transactions/sales/invoice/create']"
                [queryParams]="{ joId: jo.id, mode: 'invoice' }"
                class="btn btn-secondary">
                Issue Invoice
              </a>
            }
          }

          <!-- CN Actions (only when invoice exists) -->
          @if (jo.invoiceId || jo.hasTempDo) {
            <a
              [routerLink]="['/transactions/sales/cn/create']"
              [queryParams]="{ joId: jo.id }"
              class="btn">
              Create Sales CN
            </a>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .detail-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; }
    .detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .detail-header h2 { margin: 0; }
    .detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .detail-field label { display: block; font-size: 0.75rem; color: #718096; text-transform: uppercase; margin-bottom: 0.25rem; }
    .detail-field span { font-size: 0.95rem; }
    .full-width { grid-column: 1 / -1; }
    .text-bold { font-weight: 600; }
    .data-table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
    .data-table th, .data-table td { padding: 0.5rem; border-bottom: 1px solid #e2e8f0; text-align: left; }
    .data-table th { font-weight: 600; background: #f7fafc; }
    .text-right { text-align: right; }
    .actions-section { border-top: 1px solid #e2e8f0; padding-top: 1rem; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .actions-section h3 { width: 100%; margin-bottom: 0.5rem; }
    .badge { padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; font-weight: 600; }
    .badge-open { background: #bee3f8; color: #2a4365; }
    .badge-in_progress { background: #fefcbf; color: #744210; }
    .badge-done { background: #c6f6d5; color: #22543d; }
    .btn { padding: 0.5rem 1rem; border: 1px solid #cbd5e0; border-radius: 4px; cursor: pointer; text-decoration: none; color: inherit; background: white; }
    .btn-primary { background: #3182ce; color: white; border-color: #3182ce; }
    .btn-secondary { background: #48bb78; color: white; border-color: #48bb78; }
    .alert-success { background: #c6f6d5; color: #22543d; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .alert-error { background: #fed7d7; color: #9b2c2c; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .loading { padding: 2rem; text-align: center; color: #718096; }
  `],
})
export class JobOrderDetailComponent implements OnInit, OnDestroy {
  readonly state = inject(TransactionsStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.state.loadJobOrder(id);
    }
  }

  ngOnDestroy(): void {
    this.state.clearSelectedJobOrder();
    this.state.clearSubmitState();
  }

  updateStatus(status: string): void {
    const jo = this.state.selectedJobOrder();
    if (!jo) return;

    this.state.updateJobOrderStatus(jo.id, { status: status as JOStatus });
  }
}
