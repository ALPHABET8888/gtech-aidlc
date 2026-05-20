import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PeriodApiService } from '../../services/period-api.service';
import { Period, PeriodStatus, CreatePeriodDto } from '../../models/master-data.models';

@Component({
  selector: 'app-period-management',
  standalone: true,
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <header class="page-header">
        <h2 class="page-title">Periods</h2>
        <button class="btn btn-primary" (click)="openCreateDialog()">+ Open New Period</button>
      </header>

      <!-- Loading state -->
      @if (periodApi.loading() && !showCreateDialog() && !showCloseDialog()) {
        <div class="loading-indicator" role="status" aria-label="Loading periods">
          <span class="spinner"></span>
          <span>Loading...</span>
        </div>
      }

      <!-- Error state -->
      @if (periodApi.error()) {
        <div class="error-message" role="alert">
          <span>⚠️ {{ periodApi.error() }}</span>
          <button class="btn btn-sm" (click)="loadPeriods()">Retry</button>
        </div>
      }

      <!-- Table -->
      @if (!periodApi.loading() || showCreateDialog() || showCloseDialog()) {
        <div class="table-container">
          <table class="data-table" aria-label="Periods list">
            <thead>
              <tr>
                <th>Period</th>
                <th>Status</th>
                <th>Opened At</th>
                <th>Opened By</th>
                <th>Closed At</th>
                <th>Closed By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @if (periods().length === 0) {
                <tr>
                  <td colspan="7" class="empty-state">No periods found</td>
                </tr>
              }
              @for (period of periods(); track period.id) {
                <tr>
                  <td class="cell-code">{{ period.period }}</td>
                  <td>
                    <span
                      class="status-badge"
                      [class.open]="period.status === 'OPEN'"
                      [class.closed]="period.status === 'CLOSED'"
                    >
                      {{ period.status }}
                    </span>
                  </td>
                  <td>{{ period.openedAt | date:'short' }}</td>
                  <td>{{ period.openedBy || '—' }}</td>
                  <td>{{ period.closedAt ? (period.closedAt | date:'short') : '—' }}</td>
                  <td>{{ period.closedBy || '—' }}</td>
                  <td class="cell-actions">
                    @if (period.status === 'OPEN') {
                      <button
                        class="btn btn-sm btn-danger"
                        (click)="openCloseDialog(period)"
                        aria-label="Close period"
                      >Close Period</button>
                    } @else {
                      <span class="text-muted">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- Create Period Dialog -->
      @if (showCreateDialog()) {
        <div class="dialog-overlay" (click)="closeCreateDialog()" role="dialog" aria-modal="true" aria-labelledby="create-dialog-title">
          <div class="dialog-content" (click)="$event.stopPropagation()">
            <header class="dialog-header">
              <h3 id="create-dialog-title">Open New Period</h3>
              <button class="btn-close" (click)="closeCreateDialog()" aria-label="Close dialog">×</button>
            </header>

            <form (ngSubmit)="onCreateSubmit()" class="dialog-form" novalidate>
              <div class="form-group">
                <label for="period" class="form-label">
                  Period (YYYY-MM) <span class="required">*</span>
                </label>
                <input
                  id="period"
                  type="month"
                  class="form-input"
                  [class.invalid]="createError()"
                  [ngModel]="newPeriodValue()"
                  (ngModelChange)="newPeriodValue.set($event)"
                  name="period"
                  required
                  placeholder="YYYY-MM"
                />
                @if (createError()) {
                  <span class="field-error">{{ createError() }}</span>
                }
              </div>

              <div class="form-actions">
                <button type="button" class="btn" (click)="closeCreateDialog()">Cancel</button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  [disabled]="!newPeriodValue() || createSubmitting()"
                >
                  @if (createSubmitting()) {
                    <span class="spinner spinner-sm"></span>
                    Creating...
                  } @else {
                    Open Period
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Close Period Confirmation Dialog -->
      @if (showCloseDialog()) {
        <div class="dialog-overlay" (click)="closeCloseDialog()" role="dialog" aria-modal="true" aria-labelledby="close-dialog-title">
          <div class="dialog-content" (click)="$event.stopPropagation()">
            <header class="dialog-header">
              <h3 id="close-dialog-title">Close Period</h3>
              <button class="btn-close" (click)="closeCloseDialog()" aria-label="Close dialog">×</button>
            </header>

            <div class="confirm-message">
              <p>Are you sure you want to close period <strong>{{ closingPeriod()?.period }}</strong>?</p>
              <p class="confirm-warning">
                ⚠️ Once closed, no new transactions can be posted to this period. This action cannot be undone.
              </p>
            </div>

            @if (closeError()) {
              <div class="error-message" role="alert">
                <span>⚠️ {{ closeError() }}</span>
              </div>
            }

            <div class="form-actions">
              <button class="btn" (click)="closeCloseDialog()">Cancel</button>
              <button
                class="btn btn-danger"
                (click)="onConfirmClose()"
                [disabled]="closeSubmitting()"
              >
                @if (closeSubmitting()) {
                  <span class="spinner spinner-sm"></span>
                  Closing...
                } @else {
                  Confirm Close
                }
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-container { padding: 24px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .page-title { margin: 0; font-size: 20px; font-weight: 600; color: #212121; }
    .loading-indicator { display: flex; align-items: center; gap: 8px; padding: 24px; color: #616161; font-size: 14px; }
    .spinner { width: 16px; height: 16px; border: 2px solid #e0e0e0; border-top-color: #1565c0; border-radius: 50%; animation: spin 0.6s linear infinite; display: inline-block; }
    .spinner-sm { width: 14px; height: 14px; border-width: 2px; margin-right: 4px; }
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
    .cell-actions { display: flex; gap: 8px; }
    .text-muted { color: #9ca3af; }
    .empty-state { text-align: center; color: #9ca3af; padding: 40px 16px !important; font-style: italic; }
    .status-badge {
      display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
      &.open { background: #dcfce7; color: #166534; }
      &.closed { background: #f3f4f6; color: #6b7280; }
    }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; background: #ffffff; color: #374151; text-decoration: none; transition: all 0.15s;
      &:hover:not(:disabled) { background: #f9fafb; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    .btn-sm { padding: 4px 10px; font-size: 12px; }
    .btn-primary { background: #1565c0; color: #ffffff; border-color: #1565c0; &:hover:not(:disabled) { background: #0d47a1; } }
    .btn-danger { background: #dc2626; color: #ffffff; border-color: #dc2626; &:hover:not(:disabled) { background: #b91c1c; } }
    .btn-close { background: none; border: none; font-size: 24px; color: #6b7280; cursor: pointer; padding: 0 4px; line-height: 1; &:hover { color: #374151; } }

    /* Dialog styles */
    .dialog-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .dialog-content {
      background: #ffffff; border-radius: 8px; padding: 24px; width: 90%; max-width: 440px; max-height: 90vh; overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    .dialog-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .dialog-header h3 { margin: 0; font-size: 18px; font-weight: 600; color: #212121; }
    .dialog-form { display: flex; flex-direction: column; gap: 16px; }
    .form-group { display: flex; flex-direction: column; gap: 4px; }
    .form-label { font-size: 13px; font-weight: 500; color: #374151; }
    .required { color: #dc2626; }
    .form-input {
      padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; color: #212121; background: #ffffff; transition: border-color 0.15s;
      &:focus { outline: none; border-color: #1565c0; box-shadow: 0 0 0 2px rgba(21, 101, 192, 0.1); }
      &.invalid { border-color: #dc2626; &:focus { box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1); } }
    }
    .field-error { font-size: 12px; color: #dc2626; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #f0f0f0; }
    .confirm-message { margin-bottom: 16px; }
    .confirm-message p { margin: 0 0 8px 0; font-size: 14px; color: #374151; }
    .confirm-warning { color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 8px 12px; font-size: 13px; }
  `],
})
export class PeriodManagementComponent implements OnInit {
  protected readonly periodApi = inject(PeriodApiService);

  // List state
  readonly periods = signal<Period[]>([]);

  // Create dialog state
  readonly showCreateDialog = signal(false);
  readonly newPeriodValue = signal('');
  readonly createError = signal<string | null>(null);
  readonly createSubmitting = signal(false);

  // Close confirmation dialog state
  readonly showCloseDialog = signal(false);
  readonly closingPeriod = signal<Period | null>(null);
  readonly closeError = signal<string | null>(null);
  readonly closeSubmitting = signal(false);

  ngOnInit(): void {
    this.loadPeriods();
  }

  loadPeriods(): void {
    this.periodApi.getAll().subscribe({
      next: (periods) => {
        this.periods.set(periods);
      },
      error: (err) => {
        this.periodApi.error.set(err?.error?.message || 'Failed to load periods');
      },
    });
  }

  // ── Create Period Dialog ──────────────────────────────────

  openCreateDialog(): void {
    this.newPeriodValue.set('');
    this.createError.set(null);
    this.showCreateDialog.set(true);
  }

  closeCreateDialog(): void {
    this.showCreateDialog.set(false);
    this.newPeriodValue.set('');
    this.createError.set(null);
  }

  onCreateSubmit(): void {
    const value = this.newPeriodValue().trim();
    if (!value) {
      this.createError.set('Period is required');
      return;
    }

    // Validate YYYY-MM format
    const periodRegex = /^\d{4}-\d{2}$/;
    if (!periodRegex.test(value)) {
      this.createError.set('Period must be in YYYY-MM format');
      return;
    }

    this.createError.set(null);
    this.createSubmitting.set(true);

    const dto: CreatePeriodDto = { period: value };
    this.periodApi.create(dto).subscribe({
      next: () => {
        this.createSubmitting.set(false);
        this.closeCreateDialog();
        this.loadPeriods();
      },
      error: (err) => {
        this.createSubmitting.set(false);
        this.createError.set(err?.error?.message || 'Failed to create period');
      },
    });
  }

  // ── Close Period Confirmation Dialog ──────────────────────

  openCloseDialog(period: Period): void {
    this.closingPeriod.set(period);
    this.closeError.set(null);
    this.showCloseDialog.set(true);
  }

  closeCloseDialog(): void {
    this.showCloseDialog.set(false);
    this.closingPeriod.set(null);
    this.closeError.set(null);
  }

  onConfirmClose(): void {
    const period = this.closingPeriod();
    if (!period) return;

    this.closeError.set(null);
    this.closeSubmitting.set(true);

    this.periodApi.close(period.id).subscribe({
      next: () => {
        this.closeSubmitting.set(false);
        this.closeCloseDialog();
        this.loadPeriods();
      },
      error: (err) => {
        this.closeSubmitting.set(false);
        this.closeError.set(err?.error?.message || 'Failed to close period');
      },
    });
  }
}
