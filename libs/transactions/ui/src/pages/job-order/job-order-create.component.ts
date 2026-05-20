import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TransactionsStateService } from '../../services/transactions-state.service';
import { QtyPositiveValidatorDirective, PricePositiveValidatorDirective } from '../../validators';
import { CreateJobOrderRequest, JobOrderItem } from '../../models';

/**
 * Job Order Create page — template-driven form for creating a new Job Order.
 * Stories: US-008
 */
@Component({
  selector: 'app-job-order-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, QtyPositiveValidatorDirective, PricePositiveValidatorDirective],
  template: `
    <div class="page-header">
      <h1>Create Job Order</h1>
      <a routerLink="/transactions/job-orders" class="btn">← Back to List</a>
    </div>

    <!-- Success Message -->
    @if (state.submitSuccess()) {
      <div class="alert alert-success">{{ state.submitSuccess() }}</div>
    }

    <!-- Error Message -->
    @if (state.submitError()) {
      <div class="alert alert-error">{{ state.submitError() }}</div>
    }

    <form #joForm="ngForm" (ngSubmit)="onSubmit(joForm.valid)" novalidate>
      <!-- Customer -->
      <div class="form-group">
        <label for="customerId">ลูกค้า *</label>
        <select
          id="customerId"
          [(ngModel)]="formData.customerId"
          name="customerId"
          required
          #customerIdField="ngModel"
        >
          <option value="">-- เลือกลูกค้า --</option>
          @for (customer of state.activeCustomers(); track customer.id) {
            <option [value]="customer.id">{{ customer.code }} - {{ customer.name }}</option>
          }
        </select>
        @if (customerIdField.invalid && customerIdField.touched) {
          <span class="field-error">กรุณาเลือกลูกค้า</span>
        }
      </div>

      <!-- Notes -->
      <div class="form-group">
        <label for="notes">Notes</label>
        <textarea
          id="notes"
          [(ngModel)]="formData.notes"
          name="notes"
          placeholder="Optional notes"
          rows="2"
        ></textarea>
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
            <div class="form-group">
              <label [for]="'unitPrice_' + i">Unit Price *</label>
              <input
                [id]="'unitPrice_' + i"
                type="number"
                [(ngModel)]="item.unitPrice"
                [name]="'unitPrice_' + i"
                required
                appPricePositive
                step="0.01"
              />
            </div>
            <div class="form-group">
              <label [for]="'desc_' + i">Description</label>
              <input
                [id]="'desc_' + i"
                type="text"
                [(ngModel)]="item.description"
                [name]="'desc_' + i"
                placeholder="Optional"
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

        @if (items.length === 0) {
          <p class="field-error">At least one item is required</p>
        }
      </div>

      <!-- Submit -->
      <div class="form-actions">
        <button
          type="submit"
          class="btn btn-primary"
          [disabled]="joForm.invalid || items.length === 0 || state.submitting()">
          {{ state.submitting() ? 'Creating...' : 'Create Job Order' }}
        </button>
        <a routerLink="/transactions/job-orders" class="btn">Cancel</a>
      </div>
    </form>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .form-group { margin-bottom: 0.75rem; }
    .form-group label { display: block; font-weight: 500; margin-bottom: 0.25rem; }
    .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e0; border-radius: 4px; }
    .form-section { margin: 1.5rem 0; padding: 1rem; border: 1px solid #e2e8f0; border-radius: 8px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .section-header h3 { margin: 0; }
    .item-row { display: grid; grid-template-columns: 2fr 1fr 1fr 2fr auto; gap: 0.5rem; align-items: end; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #f0f0f0; }
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
export class JobOrderCreateComponent {
  readonly state = inject(TransactionsStateService);
  private readonly router = inject(Router);

  constructor() {
    this.state.loadMasterData();
  }

  formData = {
    customerId: '',
    notes: '',
  };

  items: JobOrderItem[] = [
    { itemId: '', qty: 1, unitPrice: 0, description: '' },
  ];

  addItem(): void {
    this.items = [...this.items, { itemId: '', qty: 1, unitPrice: 0, description: '' }];
  }

  removeItem(index: number): void {
    this.items = this.items.filter((_, i) => i !== index);
  }

  onSubmit(valid: boolean | null | undefined): void {
    if (!valid || this.items.length === 0) return;

    const dto: CreateJobOrderRequest = {
      customerId: this.formData.customerId,
      items: this.items.map((item) => ({
        itemId: item.itemId,
        qty: item.qty,
        unitPrice: item.unitPrice,
        ...(item.description ? { description: item.description } : {}),
      })),
      ...(this.formData.notes ? { notes: this.formData.notes } : {}),
    };

    this.state.createJobOrder(dto, (jo) => {
      this.router.navigate(['/transactions/job-orders', jo.id]);
    });
  }
}
