import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TransactionsStateService } from '../../services/transactions-state.service';
import { QtyPositiveValidatorDirective } from '../../validators';
import { InvoiceItem, IssueInvoiceRequest, IssueTempDoRequest } from '../../models';

/**
 * Invoice Create page — issues TEMP_DO (Path A) or Invoice (Path B) from a completed Job Order.
 * Auto-determines TX type based on hasTempDo flag.
 * Stories: US-009, US-010, US-011
 */
@Component({
  selector: 'app-invoice-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, QtyPositiveValidatorDirective],
  template: `
    <div class="page-header">
      <h1>{{ issueTempDo ? 'Issue TEMP_DO' : 'Issue Invoice' }}</h1>
      @if (joId) {
        <a [routerLink]="['/transactions/job-orders', joId]" class="btn">← Back to Job Order</a>
      } @else {
        <a routerLink="/transactions/job-orders" class="btn">← Back to List</a>
      }
    </div>

    <!-- Success Message -->
    @if (state.submitSuccess()) {
      <div class="alert alert-success">{{ state.submitSuccess() }}</div>
    }

    <!-- Error Message -->
    @if (state.submitError()) {
      <div class="alert alert-error">{{ state.submitError() }}</div>
    }

    <!-- JO Info -->
    @if (state.selectedJobOrder(); as jo) {
      <div class="info-card">
        <h3>Job Order: {{ jo.joNumber }}</h3>
        <p>Customer: {{ jo.customerId | slice:0:8 }}... | Grand Total: {{ jo.grandTotal | number:'1.2-2' }} THB</p>
        @if (jo.hasTempDo) {
          <p class="info-note">This JO already has a TEMP_DO. Invoice will be issued as INVOICE_FROM_DO.</p>
        }
      </div>
    }

    <form #invoiceForm="ngForm" (ngSubmit)="onSubmit(invoiceForm.valid)" novalidate>
      <!-- Warehouse -->
      <div class="form-group">
        <label for="warehouseId">คลังสินค้า *</label>
        <select
          id="warehouseId"
          [(ngModel)]="warehouseId"
          name="warehouseId"
          required
          #warehouseField="ngModel"
        >
          <option value="">-- เลือกคลังสินค้า --</option>
          @for (wh of state.activeWarehouses(); track wh.id) {
            <option [value]="wh.id">{{ wh.code }} - {{ wh.name }}</option>
          }
        </select>
        @if (warehouseField.invalid && warehouseField.touched) {
          <span class="field-error">กรุณาเลือกคลังสินค้า</span>
        }
      </div>

      <!-- Items -->
      <div class="form-section">
        <div class="section-header">
          <h3>Items</h3>
          <button type="button" class="btn btn-sm" (click)="addItem()">+ Add Item</button>
        </div>

        @for (item of items; track $index; let i = $index) {
          <div class="item-row">
            <div class="form-group">
              <label [for]="'itemId_' + i">สินค้า *</label>
              <select
                [id]="'itemId_' + i"
                [(ngModel)]="item.itemId"
                [name]="'itemId_' + i"
                required
              >
                <option value="">-- เลือกสินค้า --</option>
                @for (it of state.activeItems(); track it.id) {
                  <option [value]="it.id">{{ it.code }} - {{ it.name }}</option>
                }
              </select>
            </div>
            <div class="form-group">
              <label [for]="'qty_' + i">Qty *</label>
              <input
                [id]="'qty_' + i"
                type="number"
                [(ngModel)]="item.qty"
                [name]="'qty_' + i"
                required
                appQtyPositive
                min="1"
              />
            </div>
            <button
              type="button"
              class="btn btn-danger btn-sm"
              (click)="removeItem(i)"
              [disabled]="items.length <= 1">
              ✕
            </button>
          </div>
        }
      </div>

      <!-- Submit -->
      <div class="form-actions">
        <button
          type="submit"
          class="btn btn-primary"
          [disabled]="invoiceForm.invalid || items.length === 0 || state.submitting()">
          {{ state.submitting() ? 'Processing...' : (issueTempDo ? 'Issue TEMP_DO' : 'Issue Invoice') }}
        </button>
        @if (joId) {
          <a [routerLink]="['/transactions/job-orders', joId]" class="btn">Cancel</a>
        }
      </div>
    </form>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .info-card { background: #ebf8ff; border: 1px solid #bee3f8; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
    .info-card h3 { margin: 0 0 0.5rem 0; }
    .info-card p { margin: 0; color: #2a4365; }
    .info-note { font-style: italic; margin-top: 0.5rem !important; }
    .form-group { margin-bottom: 0.75rem; }
    .form-group label { display: block; font-weight: 500; margin-bottom: 0.25rem; }
    .form-group input { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e0; border-radius: 4px; }
    .form-section { margin: 1.5rem 0; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .section-header h3 { margin: 0; }
    .item-row { display: grid; grid-template-columns: 3fr 1fr auto; gap: 0.5rem; align-items: end; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #f0f0f0; }
    .form-actions { display: flex; gap: 0.5rem; margin-top: 1.5rem; }
    .btn { padding: 0.5rem 1rem; border: 1px solid #cbd5e0; border-radius: 4px; cursor: pointer; text-decoration: none; color: inherit; background: white; }
    .btn-primary { background: #3182ce; color: white; border-color: #3182ce; }
    .btn-danger { background: #e53e3e; color: white; border-color: #e53e3e; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.875rem; }
    .field-error { color: #e53e3e; font-size: 0.75rem; }
    .alert-success { background: #c6f6d5; color: #22543d; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
    .alert-error { background: #fed7d7; color: #9b2c2c; padding: 0.75rem; border-radius: 4px; margin-bottom: 1rem; }
  `],
})
export class InvoiceCreateComponent implements OnInit, OnDestroy {
  readonly state = inject(TransactionsStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  joId = '';
  issueTempDo = false;
  warehouseId = '';
  items: InvoiceItem[] = [{ itemId: '', qty: 1 }];

  ngOnInit(): void {
    this.state.loadMasterData();
    this.joId = this.route.snapshot.queryParamMap.get('joId') || '';
    const mode = this.route.snapshot.queryParamMap.get('mode');
    this.issueTempDo = mode === 'temp-do';

    if (this.joId) {
      this.state.loadJobOrder(this.joId);
    }
  }

  ngOnDestroy(): void {
    this.state.clearSubmitState();
  }

  addItem(): void {
    this.items = [...this.items, { itemId: '', qty: 1 }];
  }

  removeItem(index: number): void {
    this.items = this.items.filter((_, i) => i !== index);
  }

  onSubmit(valid: boolean | null | undefined): void {
    if (!valid || this.items.length === 0 || !this.joId) return;

    if (this.issueTempDo) {
      const dto: IssueTempDoRequest = {
        warehouseId: this.warehouseId,
        items: this.items.map((item) => ({ itemId: item.itemId, qty: item.qty })),
      };
      this.state.issueTempDo(this.joId, dto, () => {
        this.router.navigate(['/transactions/job-orders', this.joId]);
      });
    } else {
      const dto: IssueInvoiceRequest = {
        warehouseId: this.warehouseId,
        items: this.items.map((item) => ({ itemId: item.itemId, qty: item.qty })),
      };
      this.state.issueInvoice(this.joId, dto, () => {
        this.router.navigate(['/transactions/job-orders', this.joId]);
      });
    }
  }
}
