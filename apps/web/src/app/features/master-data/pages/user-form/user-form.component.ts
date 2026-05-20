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
import { UserApiService } from '../../services/user-api.service';
import {
  User,
  RoleName,
  UserRole,
  CreateUserDto,
  UpdateUserDto,
} from '../../models/master-data.models';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <header class="page-header">
        <h2 class="page-title">{{ isEditMode() ? 'Edit User' : 'New User' }}</h2>
        <a routerLink="/master-data/users" class="btn btn-outline">← Back to List</a>
      </header>

      <!-- Loading -->
      @if (loadingUser()) {
        <div class="loading-indicator" role="status" aria-label="Loading user">
          <span class="spinner"></span>
          <span>Loading user...</span>
        </div>
      }

      <!-- Error -->
      @if (errorMessage()) {
        <div class="error-message" role="alert">
          <span>⚠️ {{ errorMessage() }}</span>
        </div>
      }

      <!-- Form -->
      @if (!loadingUser()) {
        <form
          [formGroup]="form"
          (ngSubmit)="onSubmit()"
          class="user-form"
          novalidate
        >
          <div class="form-grid">
            <!-- Username -->
            <div class="form-group">
              <label for="username" class="form-label">
                Username <span class="required">*</span>
              </label>
              <input
                id="username"
                type="text"
                formControlName="username"
                class="form-input"
                [class.invalid]="isFieldInvalid('username')"
                placeholder="e.g. john.doe"
                maxlength="50"
              />
              @if (isFieldInvalid('username')) {
                <span class="field-error">
                  @if (form.get('username')?.errors?.['required']) {
                    Username is required
                  } @else if (form.get('username')?.errors?.['maxlength']) {
                    Username must be 50 characters or less
                  } @else if (form.get('username')?.errors?.['pattern']) {
                    Username must be alphanumeric (dots, dashes, underscores allowed)
                  }
                </span>
              }
            </div>

            <!-- Full Name -->
            <div class="form-group">
              <label for="fullName" class="form-label">
                Full Name <span class="required">*</span>
              </label>
              <input
                id="fullName"
                type="text"
                formControlName="fullName"
                class="form-input"
                [class.invalid]="isFieldInvalid('fullName')"
                placeholder="Full name"
                maxlength="200"
              />
              @if (isFieldInvalid('fullName')) {
                <span class="field-error">
                  @if (form.get('fullName')?.errors?.['required']) {
                    Full name is required
                  } @else if (form.get('fullName')?.errors?.['maxlength']) {
                    Full name must be 200 characters or less
                  }
                </span>
              }
            </div>

            <!-- Email -->
            <div class="form-group">
              <label for="email" class="form-label">Email</label>
              <input
                id="email"
                type="email"
                formControlName="email"
                class="form-input"
                [class.invalid]="isFieldInvalid('email')"
                placeholder="user@example.com"
                maxlength="100"
              />
              @if (isFieldInvalid('email')) {
                <span class="field-error">Invalid email format</span>
              }
            </div>

            <!-- Password -->
            <div class="form-group">
              <label for="password" class="form-label">
                Password
                @if (!isEditMode()) {
                  <span class="required">*</span>
                }
              </label>
              <input
                id="password"
                type="password"
                formControlName="password"
                class="form-input"
                [class.invalid]="isFieldInvalid('password')"
                [placeholder]="isEditMode() ? 'Leave blank to keep current' : 'Enter password'"
              />
              @if (isFieldInvalid('password')) {
                <span class="field-error">
                  @if (form.get('password')?.errors?.['required']) {
                    Password is required
                  } @else if (form.get('password')?.errors?.['minlength']) {
                    Password must be at least 6 characters
                  }
                </span>
              }
            </div>

            <!-- Status (edit mode only) -->
            @if (isEditMode()) {
              <div class="form-group">
                <label for="isActive" class="form-label">Status</label>
                <select id="isActive" formControlName="isActive" class="form-input">
                  <option [ngValue]="true">Active</option>
                  <option [ngValue]="false">Inactive</option>
                </select>
              </div>
            }
          </div>

          <!-- Role Assignment Section -->
          <section class="roles-section" aria-labelledby="roles-heading">
            <h3 id="roles-heading" class="section-title">Role Assignment</h3>
            <p class="section-description">Select roles to assign to this user:</p>

            <div class="role-grid">
              @for (roleName of availableRoleNames; track roleName) {
                <label
                  class="role-toggle"
                  [class.selected]="isRoleSelected(roleName)"
                  [attr.data-role]="roleName"
                >
                  <input
                    type="checkbox"
                    [checked]="isRoleSelected(roleName)"
                    (change)="toggleRole(roleName)"
                  />
                  <span class="role-toggle-label">{{ roleName }}</span>
                  <span class="role-toggle-desc">{{ getRoleDescription(roleName) }}</span>
                </label>
              }
            </div>

            <!-- Selected roles display -->
            <div class="selected-roles">
              <strong>Selected:</strong>
              @if (selectedRoles().length > 0) {
                @for (role of selectedRoles(); track role) {
                  <span class="role-chip" [attr.data-role]="role">{{ role }}</span>
                }
              } @else {
                <span class="text-muted">No roles selected</span>
              }
            </div>
          </section>

          <!-- Form Actions -->
          <div class="form-actions">
            <a routerLink="/master-data/users" class="btn">Cancel</a>
            <button
              type="submit"
              class="btn btn-primary"
              [disabled]="form.invalid || submitting()"
            >
              @if (submitting()) {
                <span class="spinner spinner-sm"></span>
                Saving...
              } @else {
                {{ isEditMode() ? 'Update User' : 'Create User' }}
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

    .user-form {
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

    /* Roles section */
    .roles-section {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #f0f0f0;
    }

    .section-title {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 600;
      color: #212121;
    }

    .section-description {
      margin: 0 0 12px;
      font-size: 13px;
      color: #6b7280;
    }

    .role-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;

      @media (max-width: 600px) {
        grid-template-columns: 1fr;
      }
    }

    .role-toggle {
      display: flex;
      flex-direction: column;
      padding: 10px 12px;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: #90caf9;
        background: #f8fbff;
      }

      &.selected {
        border-color: #1565c0;
        background: #e3f2fd;
      }

      input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }
    }

    .role-toggle-label {
      font-size: 13px;
      font-weight: 600;
      color: #212121;
    }

    .role-toggle-desc {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }

    .selected-roles {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-top: 12px;
      padding: 12px 0;
    }

    .selected-roles strong {
      font-size: 13px;
      color: #374151;
      margin-right: 4px;
    }

    .text-muted {
      color: #9ca3af;
      font-size: 13px;
    }

    .role-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      background: #e3f2fd;
      color: #1565c0;

      &[data-role="ADMIN"] { background: #fce4ec; color: #c62828; }
      &[data-role="CFO"] { background: #f3e5f5; color: #6a1b9a; }
      &[data-role="MANAGER"] { background: #fff3e0; color: #e65100; }
      &[data-role="SUPERVISOR"] { background: #e8f5e9; color: #2e7d32; }
      &[data-role="STORE"] { background: #e0f7fa; color: #00695c; }
      &[data-role="CASHIER"] { background: #f5f5f5; color: #424242; }
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
export class UserFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly userApi = inject(UserApiService);

  // Available roles
  readonly availableRoleNames: RoleName[] = ['CASHIER', 'STORE', 'SUPERVISOR', 'MANAGER', 'CFO', 'ADMIN'];

  // State
  readonly isEditMode = signal(false);
  readonly loadingUser = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly selectedRoles = signal<RoleName[]>([]);
  private userId: string | null = null;
  private existingUserRoles: UserRole[] = [];

  // Reactive form
  readonly form: FormGroup = this.fb.group({
    username: [
      '',
      [Validators.required, Validators.maxLength(50), Validators.pattern(/^[A-Za-z0-9._\-]+$/)],
    ],
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.maxLength(100), Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id');

    if (this.userId) {
      this.isEditMode.set(true);
      this.form.get('username')?.disable();
      // Password optional in edit mode
      this.form.get('password')?.clearValidators();
      this.form.get('password')?.setValidators([Validators.minLength(6)]);
      this.form.get('password')?.updateValueAndValidity();
      this.loadUser(this.userId);
    }
  }

  private loadUser(id: string): void {
    this.loadingUser.set(true);
    this.errorMessage.set(null);

    this.userApi.getById(id).subscribe({
      next: (user: User) => {
        this.form.patchValue({
          username: user.username,
          fullName: user.fullName,
          email: user.email || '',
          password: '',
          isActive: user.isActive,
        });

        // Load existing roles
        this.existingUserRoles = user.userRoles || [];
        this.selectedRoles.set(
          this.existingUserRoles.map((ur) => ur.role.name)
        );

        this.loadingUser.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to load user');
        this.loadingUser.set(false);
      },
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set(null);
    this.submitting.set(true);

    if (this.isEditMode() && this.userId) {
      const dto: UpdateUserDto = {
        fullName: this.form.value.fullName,
        email: this.form.value.email || undefined,
        isActive: this.form.value.isActive,
      };
      const password = this.form.value.password;
      if (password) {
        dto.password = password;
      }

      this.userApi.update(this.userId, dto).subscribe({
        next: () => {
          // Sync roles after user update
          this.syncRoles(this.userId!);
        },
        error: (err) => {
          this.submitting.set(false);
          this.errorMessage.set(err?.error?.message || 'Failed to update user');
        },
      });
    } else {
      const dto: CreateUserDto = {
        username: this.form.value.username,
        password: this.form.value.password,
        fullName: this.form.value.fullName,
        email: this.form.value.email || undefined,
      };

      this.userApi.create(dto).subscribe({
        next: (createdUser: User) => {
          // Assign roles to new user
          const rolesToAssign = this.selectedRoles();
          if (rolesToAssign.length > 0) {
            this.userApi.assignRoles(createdUser.id, rolesToAssign).subscribe({
              next: () => {
                this.submitting.set(false);
                this.router.navigate(['/master-data/users']);
              },
              error: (err) => {
                // User created but role assignment failed — navigate anyway
                this.submitting.set(false);
                this.router.navigate(['/master-data/users']);
              },
            });
          } else {
            this.submitting.set(false);
            this.router.navigate(['/master-data/users']);
          }
        },
        error: (err) => {
          this.submitting.set(false);
          this.errorMessage.set(err?.error?.message || 'Failed to create user');
        },
      });
    }
  }

  /**
   * Synchronize role assignments: add new roles, remove old ones.
   */
  private syncRoles(userId: string): void {
    const currentRoleNames = this.existingUserRoles.map((ur) => ur.role.name);
    const desiredRoleNames = this.selectedRoles();

    const rolesToAdd = desiredRoleNames.filter((r) => !currentRoleNames.includes(r));
    const rolesToRemove = this.existingUserRoles.filter(
      (ur) => !desiredRoleNames.includes(ur.role.name)
    );

    // If no role changes, navigate immediately
    if (rolesToAdd.length === 0 && rolesToRemove.length === 0) {
      this.submitting.set(false);
      this.router.navigate(['/master-data/users']);
      return;
    }

    let pending = 0;
    let hasError = false;

    const checkComplete = () => {
      pending--;
      if (pending <= 0) {
        this.submitting.set(false);
        if (!hasError) {
          this.router.navigate(['/master-data/users']);
        }
      }
    };

    // Assign new roles
    if (rolesToAdd.length > 0) {
      pending++;
      this.userApi.assignRoles(userId, rolesToAdd).subscribe({
        next: () => checkComplete(),
        error: (err) => {
          hasError = true;
          this.errorMessage.set(err?.error?.message || 'Failed to assign roles');
          checkComplete();
        },
      });
    }

    // Remove old roles
    for (const ur of rolesToRemove) {
      pending++;
      this.userApi.removeRole(userId, ur.roleId).subscribe({
        next: () => checkComplete(),
        error: (err) => {
          hasError = true;
          this.errorMessage.set(err?.error?.message || 'Failed to remove role');
          checkComplete();
        },
      });
    }
  }

  isRoleSelected(roleName: RoleName): boolean {
    return this.selectedRoles().includes(roleName);
  }

  toggleRole(roleName: RoleName): void {
    this.selectedRoles.update((roles) => {
      if (roles.includes(roleName)) {
        return roles.filter((r) => r !== roleName);
      }
      return [...roles, roleName];
    });
  }

  getRoleDescription(roleName: RoleName): string {
    const descriptions: Record<RoleName, string> = {
      CASHIER: 'Process sales & invoices',
      STORE: 'Goods receipt & stock',
      SUPERVISOR: 'Approve returns & transfers',
      MANAGER: 'Approve CN, VOID, AP',
      CFO: 'Period close & write-off',
      ADMIN: 'System configuration',
    };
    return descriptions[roleName];
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }
}
