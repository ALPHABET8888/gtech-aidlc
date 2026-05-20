import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ItemApiService } from '../../services/item-api.service';
import { Item, CreateItemDto, UpdateItemDto } from '../../models/master-data.models';

@Component({
  selector: 'app-item-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <header class="page-header">
        <h2 class="page-title">{{ isEditMode() ? 'Edit Item' : 'New Item' }}</h2>
        <a routerLink="/master-data/items" class="btn btn-outline">← Back to List</a>
      </header>

      <!-- Loading -->
      @if (loadingItem()) {
        <div class="loading-indicator" role="status" aria-label="Loading item">
          <span class="spinner"></span>
          <span>Loading item...</span>
        </div>
      }

      <!-- Error -->
      @if (errorMessage()) {
        <div class="error-message" role="alert">
          <span>⚠️ {{ errorMessage() }}</span>
        </div>
      }

      <!-- Form -->
      @if (!loadingItem()) {
        <form
          [formGroup]="form"
          (ngSubmit)="onSubmit()"
          class="item-form"
          novalidate
        >
          <div class="form-grid">
            <!-- Code field (disabled in edit mode) -->
            <div class="form-group">
              <label for="code" class="form-label">
                Code <span class="required">*</span>
              </label>
              <input
                id="code"
                type="text"
                formControlName="code"
                class="form-input"
                [class.invalid]="isFieldInvalid('code')"
                placeholder="e.g. ITM-001"
                maxlength="20"
              />
              @if (isFieldInvalid('code')) {
                <span class="field-error">
                  @if (form.get('code')?.errors?.['required']) {
                    Code is required
                  } @else if (form.get('code')?.errors?.['maxlength']) {
                    Code must be 20 characters or less
                  } @else if (form.get('code')?.errors?.['pattern']) {
                    Code must be alphanumeric with dashes
                  }
                </span>
              }
            </div>

            <!-- Name -->
            <div class="form-group">
              <label for="name" class="form-label">
                Name <span class="required">*</span>
              </label>
              <input
                id="name"
                type="text"
                formControlName="name"
                class="form-input"
                [class.invalid]="isFieldInvalid('name')"
                placeholder="Item name"
                maxlength="200"
              />
              @if (isFieldInvalid('name')) {
                <span class="field-error">
                  @if (form.get('name')?.errors?.['required']) {
                    Name is required
                  } @else if (form.get('name')?.errors?.['maxlength']) {
                    Name must be 200 characters or less
                  }
                </span>
              }
            </div>

            <!-- Unit -->
            <div class="form-group">
              <label for="unit" class="form-label">
                Unit <span class="required">*</span>
              </label>
              <input
                id="unit"
                type="text"
                formControlName="unit"
                class="form-input"
                [class.invalid]="isFieldInvalid('unit')"
                placeholder="e.g. pcs, kg, box"
                maxlength="20"
              />
              @if (isFieldInvalid('unit')) {
                <span class="field-error">
                  @if (form.get('unit')?.errors?.['required']) {
                    Unit is required
                  } @else if (form.get('unit')?.errors?.['maxlength']) {
                    Unit must be 20 characters or less
                  }
                </span>
              }
            </div>

            <!-- Category -->
            <div class="form-group">
              <label for="category" class="form-label">Category</label>
              <input
                id="category"
                type="text"
                formControlName="category"
                class="form-input"
                placeholder="e.g. Raw Materials, Finished Goods"
                maxlength="50"
              />
            </div>

            <!-- Status (edit mode only) -->
            @if (isEditMode()) {
              <div class="form-group">
                <label for="isActive" class="form-label">Status</label>
                <select id="isActive" formControlName="isActive" class="form-input">
                  <option [value]="true">Active</option>
                  <option [value]="false">Inactive</option>
                </select>
              </div>
            }
          </div>

          <!-- Form Actions -->
          <div class="form-actions">
            <a routerLink="/master-data/items" class="btn">Cancel</a>
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="form.invalid || itemApi.loading()"
            >
              @if (itemApi.loading()) {
                <span class="spinner spinner-sm"></span>
                Saving...
              } @else {
                {{ isEditMode() ? 'Update Item' : 'Create Item' }}
              }
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .page-container {
      padding: 24px;
      max-width: 720px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .page-title {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #212121;
    }

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

    .spinner-sm {
      width: 14px;
      height: 14px;
      border-width: 2px;
      margin-right: 4px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

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

    .item-form {
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 24px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;

      @media (max-width: 600px) {
        grid-template-columns: 1fr;
      }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-label {
      font-size: 13px;
      font-weight: 500;
      color: #374151;
    }

    .required {
      color: #dc2626;
    }

    .form-input {
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 14px;
      color: #212121;
      background: #ffffff;
      transition: border-color 0.15s;

      &:focus {
        outline: none;
        border-color: #1565c0;
        box-shadow: 0 0 0 2px rgba(21, 101, 192, 0.1);
      }

      &.invalid {
        border-color: #dc2626;

        &:focus {
          box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1);
        }
      }

      &:disabled {
        background: #f3f4f6;
        color: #6b7280;
        cursor: not-allowed;
      }
    }

    .field-error {
      font-size: 12px;
      color: #dc2626;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #f0f0f0;
    }

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

      &:hover:not(:disabled) {
        background: #f9fafb;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    .btn-primary {
      background: #1565c0;
      color: #ffffff;
      border-color: #1565c0;

      &:hover:not(:disabled) {
        background: #0d47a1;
      }
    }

    .btn-outline {
      border-color: #1565c0;
      color: #1565c0;

      &:hover:not(:disabled) {
        background: #e3f2fd;
      }
    }
  `],
})
export class ItemFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly itemApi = inject(ItemApiService);

  // State
  readonly isEditMode = signal(false);
  readonly loadingItem = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private itemId: string | null = null;

  // Reactive form
  readonly form: FormGroup = this.fb.group({
    code: [
      '',
      [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9\-_]+$/)],
    ],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    unit: ['', [Validators.required, Validators.maxLength(20)]],
    category: ['', [Validators.maxLength(50)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.itemId = this.route.snapshot.paramMap.get('id');

    if (this.itemId) {
      this.isEditMode.set(true);
      this.form.get('code')?.disable();
      this.loadItem(this.itemId);
    }
  }

  private loadItem(id: string): void {
    this.loadingItem.set(true);
    this.errorMessage.set(null);

    this.itemApi.getById(id).subscribe({
      next: (item: Item) => {
        this.form.patchValue({
          code: item.code,
          name: item.name,
          unit: item.unit,
          category: item.category || '',
          isActive: item.isActive,
        });
        this.loadingItem.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to load item');
        this.loadingItem.set(false);
      },
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);

    if (this.isEditMode() && this.itemId) {
      const dto: UpdateItemDto = {
        name: this.form.value.name,
        unit: this.form.value.unit,
        category: this.form.value.category || undefined,
        isActive: this.form.value.isActive === 'true' || this.form.value.isActive === true,
      };

      this.itemApi.update(this.itemId, dto).subscribe({
        next: () => this.router.navigate(['/master-data/items']),
        error: (err) => {
          this.errorMessage.set(err?.error?.message || 'Failed to update item');
        },
      });
    } else {
      const dto: CreateItemDto = {
        code: this.form.value.code,
        name: this.form.value.name,
        unit: this.form.value.unit,
        category: this.form.value.category || undefined,
      };

      this.itemApi.create(dto).subscribe({
        next: () => this.router.navigate(['/master-data/items']),
        error: (err) => {
          this.errorMessage.set(err?.error?.message || 'Failed to create item');
        },
      });
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }
}
