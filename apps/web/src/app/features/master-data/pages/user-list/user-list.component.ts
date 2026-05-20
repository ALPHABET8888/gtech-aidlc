import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserApiService } from '../../services/user-api.service';
import {
  User,
  Role,
  RoleName,
  UserRole,
  CreateUserDto,
  UpdateUserDto,
  PaginatedResponse,
} from '../../models/master-data.models';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <header class="page-header">
        <h2 class="page-title">Users</h2>
        <a routerLink="new" class="btn btn-primary">+ New User</a>
      </header>

      <!-- Search & Filter -->
      <div class="filter-bar">
        <input
          type="text"
          class="filter-input search-input"
          placeholder="Search by name, username or email..."
          [ngModel]="searchTerm()"
          (ngModelChange)="onSearchChange($event)"
          aria-label="Search users"
        />
        <select
          class="filter-input"
          [ngModel]="statusFilter()"
          (ngModelChange)="onStatusChange($event)"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select
          class="filter-input"
          [ngModel]="roleFilter()"
          (ngModelChange)="onRoleChange($event)"
          aria-label="Filter by role"
        >
          <option value="">All Roles</option>
          @for (role of availableRoleNames; track role) {
            <option [value]="role">{{ role }}</option>
          }
        </select>
      </div>

      <!-- Loading state -->
      @if (userApi.loading() && !showFormDialog()) {
        <div class="loading-indicator" role="status" aria-label="Loading users">
          <span class="spinner"></span>
          <span>Loading...</span>
        </div>
      }

      <!-- Error state -->
      @if (userApi.error()) {
        <div class="error-message" role="alert">
          <span>⚠️ {{ userApi.error() }}</span>
          <button class="btn btn-sm" (click)="loadUsers()">Retry</button>
        </div>
      }

      <!-- Table -->
      @if (!userApi.loading() || showFormDialog()) {
        <div class="table-container">
          <table class="data-table" aria-label="Users list">
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @if (users().length === 0) {
                <tr>
                  <td colspan="6" class="empty-state">No users found</td>
                </tr>
              }
              @for (user of users(); track user.id) {
                <tr>
                  <td class="cell-code">{{ user.username }}</td>
                  <td>{{ user.fullName }}</td>
                  <td>{{ user.email || '—' }}</td>
                  <td class="cell-roles">
                    @if (user.userRoles && user.userRoles.length > 0) {
                      @for (ur of user.userRoles; track ur.id) {
                        <span class="role-chip" [attr.data-role]="ur.role.name">
                          {{ ur.role.name }}
                        </span>
                      }
                    } @else {
                      <span class="text-muted">No roles</span>
                    }
                  </td>
                  <td>
                    <span
                      class="status-badge"
                      [class.active]="user.isActive"
                      [class.inactive]="!user.isActive"
                    >
                      {{ user.isActive ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="cell-actions">
                    <a
                      [routerLink]="[user.id, 'edit']"
                      class="btn btn-sm btn-outline"
                      aria-label="Edit user"
                    >Edit</a>
                    <button
                      class="btn btn-sm btn-role"
                      (click)="openRoleDialog(user)"
                      aria-label="Manage roles"
                    >Roles</button>
                    <button
                      class="btn btn-sm btn-danger"
                      (click)="deactivateUser(user)"
                      [disabled]="!user.isActive"
                      [attr.aria-label]="'Deactivate ' + user.fullName"
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

      <!-- Create/Edit User Dialog -->
      @if (showFormDialog()) {
        <div class="dialog-overlay" (click)="closeFormDialog()" role="dialog" aria-modal="true" aria-labelledby="form-dialog-title">
          <div class="dialog-content" (click)="$event.stopPropagation()">
            <header class="dialog-header">
              <h3 id="form-dialog-title">{{ editingUser() ? 'Edit User' : 'Create User' }}</h3>
              <button class="btn-close" (click)="closeFormDialog()" aria-label="Close dialog">×</button>
            </header>

            <form [formGroup]="userForm" (ngSubmit)="onFormSubmit()" class="dialog-form" novalidate>
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
                    @if (userForm.get('username')?.errors?.['required']) {
                      Username is required
                    } @else if (userForm.get('username')?.errors?.['maxlength']) {
                      Username must be 50 characters or less
                    } @else if (userForm.get('username')?.errors?.['pattern']) {
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
                    @if (userForm.get('fullName')?.errors?.['required']) {
                      Full name is required
                    } @else if (userForm.get('fullName')?.errors?.['maxlength']) {
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
                  @if (!editingUser()) {
                    <span class="required">*</span>
                  }
                </label>
                <input
                  id="password"
                  type="password"
                  formControlName="password"
                  class="form-input"
                  [class.invalid]="isFieldInvalid('password')"
                  [placeholder]="editingUser() ? 'Leave blank to keep current' : 'Enter password'"
                />
                @if (isFieldInvalid('password')) {
                  <span class="field-error">
                    @if (userForm.get('password')?.errors?.['required']) {
                      Password is required
                    } @else if (userForm.get('password')?.errors?.['minlength']) {
                      Password must be at least 6 characters
                    }
                  </span>
                }
              </div>

              <!-- Status (edit mode only) -->
              @if (editingUser()) {
                <div class="form-group">
                  <label for="isActive" class="form-label">Status</label>
                  <select id="isActive" formControlName="isActive" class="form-input">
                    <option [ngValue]="true">Active</option>
                    <option [ngValue]="false">Inactive</option>
                  </select>
                </div>
              }

              <!-- Form error -->
              @if (formError()) {
                <div class="error-message" role="alert">
                  <span>⚠️ {{ formError() }}</span>
                </div>
              }

              <!-- Actions -->
              <div class="form-actions">
                <button type="button" class="btn" (click)="closeFormDialog()">Cancel</button>
                <button
                  type="submit"
                  class="btn btn-primary"
                  [disabled]="userForm.invalid || formSubmitting()"
                >
                  @if (formSubmitting()) {
                    <span class="spinner spinner-sm"></span>
                    Saving...
                  } @else {
                    {{ editingUser() ? 'Update User' : 'Create User' }}
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Role Assignment Dialog -->
      @if (showRoleDialog()) {
        <div class="dialog-overlay" (click)="closeRoleDialog()" role="dialog" aria-modal="true" aria-labelledby="role-dialog-title">
          <div class="dialog-content" (click)="$event.stopPropagation()">
            <header class="dialog-header">
              <h3 id="role-dialog-title">Manage Roles — {{ roleDialogUser()?.fullName }}</h3>
              <button class="btn-close" (click)="closeRoleDialog()" aria-label="Close dialog">×</button>
            </header>

            <div class="role-assignment">
              <p class="role-description">Select roles to assign to this user:</p>

              <div class="role-grid">
                @for (roleName of availableRoleNames; track roleName) {
                  <label
                    class="role-toggle"
                    [class.selected]="isRoleAssigned(roleName)"
                    [attr.data-role]="roleName"
                  >
                    <input
                      type="checkbox"
                      [checked]="isRoleAssigned(roleName)"
                      (change)="toggleRole(roleName)"
                      [disabled]="roleSubmitting()"
                    />
                    <span class="role-toggle-label">{{ roleName }}</span>
                    <span class="role-toggle-desc">{{ getRoleDescription(roleName) }}</span>
                  </label>
                }
              </div>

              <!-- Currently assigned -->
              <div class="current-roles">
                <strong>Current roles:</strong>
                @if (roleDialogUserRoles().length > 0) {
                  @for (ur of roleDialogUserRoles(); track ur.id) {
                    <span class="role-chip" [attr.data-role]="ur.role.name">
                      {{ ur.role.name }}
                      <button
                        class="role-chip-remove"
                        (click)="removeRole(ur)"
                        [disabled]="roleSubmitting()"
                        [attr.aria-label]="'Remove ' + ur.role.name + ' role'"
                      >×</button>
                    </span>
                  }
                } @else {
                  <span class="text-muted">No roles assigned</span>
                }
              </div>

              <!-- Role error -->
              @if (roleError()) {
                <div class="error-message" role="alert">
                  <span>⚠️ {{ roleError() }}</span>
                </div>
              }

              @if (roleSubmitting()) {
                <div class="loading-indicator" role="status">
                  <span class="spinner"></span>
                  <span>Updating roles...</span>
                </div>
              }
            </div>

            <div class="form-actions">
              <button class="btn" (click)="closeRoleDialog()">Close</button>
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
    .filter-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .filter-input {
      padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; color: #424242; background: #ffffff;
      &:focus { outline: none; border-color: #1565c0; box-shadow: 0 0 0 2px rgba(21, 101, 192, 0.1); }
    }
    .search-input { flex: 1; min-width: 200px; }
    .loading-indicator { display: flex; align-items: center; gap: 8px; padding: 24px; color: #616161; font-size: 14px; }
    .spinner { width: 16px; height: 16px; border: 2px solid #e0e0e0; border-top-color: #1565c0; border-radius: 50%; animation: spin 0.6s linear infinite; }
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
    .cell-roles { display: flex; flex-wrap: wrap; gap: 4px; }
    .cell-actions { display: flex; gap: 8px; }
    .text-muted { color: #9ca3af; }
    .empty-state { text-align: center; color: #9ca3af; padding: 40px 16px !important; font-style: italic; }
    .status-badge {
      display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500;
      &.active { background: #dcfce7; color: #166534; }
      &.inactive { background: #f3f4f6; color: #6b7280; }
    }
    .role-chip {
      display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px;
      background: #e3f2fd; color: #1565c0;
      &[data-role="ADMIN"] { background: #fce4ec; color: #c62828; }
      &[data-role="CFO"] { background: #f3e5f5; color: #6a1b9a; }
      &[data-role="MANAGER"] { background: #fff3e0; color: #e65100; }
      &[data-role="SUPERVISOR"] { background: #e8f5e9; color: #2e7d32; }
      &[data-role="STORE"] { background: #e0f7fa; color: #00695c; }
      &[data-role="CASHIER"] { background: #f5f5f5; color: #424242; }
    }
    .role-chip-remove {
      background: none; border: none; cursor: pointer; font-size: 14px; font-weight: bold; color: inherit; opacity: 0.7; padding: 0 2px; line-height: 1;
      &:hover { opacity: 1; }
      &:disabled { cursor: not-allowed; opacity: 0.3; }
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
    .btn-role { border-color: #6a1b9a; color: #6a1b9a; &:hover:not(:disabled) { background: #f3e5f5; } }
    .btn-danger { border-color: #dc2626; color: #dc2626; &:hover:not(:disabled) { background: #fef2f2; } }
    .btn-active { background: #1565c0; color: #ffffff; border-color: #1565c0; }
    .btn-close { background: none; border: none; font-size: 24px; color: #6b7280; cursor: pointer; padding: 0 4px; line-height: 1; &:hover { color: #374151; } }

    /* Dialog styles */
    .dialog-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .dialog-content {
      background: #ffffff; border-radius: 8px; padding: 24px; width: 90%; max-width: 520px; max-height: 90vh; overflow-y: auto;
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
      &:disabled { background: #f3f4f6; color: #6b7280; cursor: not-allowed; }
    }
    .field-error { font-size: 12px; color: #dc2626; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #f0f0f0; }

    /* Role assignment */
    .role-assignment { display: flex; flex-direction: column; gap: 16px; }
    .role-description { margin: 0; font-size: 14px; color: #6b7280; }
    .role-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .role-toggle {
      display: flex; flex-direction: column; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 6px; cursor: pointer; transition: all 0.15s;
      &:hover { border-color: #90caf9; background: #f8fbff; }
      &.selected { border-color: #1565c0; background: #e3f2fd; }
      input { position: absolute; opacity: 0; width: 0; height: 0; }
    }
    .role-toggle-label { font-size: 13px; font-weight: 600; color: #212121; }
    .role-toggle-desc { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .current-roles { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 0; border-top: 1px solid #f0f0f0; }
    .current-roles strong { font-size: 13px; color: #374151; margin-right: 4px; }
  `],
})
export class UserListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  protected readonly userApi = inject(UserApiService);

  // Available roles
  readonly availableRoleNames: RoleName[] = ['CASHIER', 'STORE', 'SUPERVISOR', 'MANAGER', 'CFO', 'ADMIN'];

  // List state
  readonly users = signal<User[]>([]);
  readonly pagination = signal<{ page: number; pageSize: number; total: number; totalPages: number } | null>(null);
  readonly searchTerm = signal('');
  readonly statusFilter = signal('');
  readonly roleFilter = signal('');
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);

  // Create/Edit dialog state
  readonly showFormDialog = signal(false);
  readonly editingUser = signal<User | null>(null);
  readonly formError = signal<string | null>(null);
  readonly formSubmitting = signal(false);

  // Role dialog state
  readonly showRoleDialog = signal(false);
  readonly roleDialogUser = signal<User | null>(null);
  readonly roleDialogUserRoles = signal<UserRole[]>([]);
  readonly roleError = signal<string | null>(null);
  readonly roleSubmitting = signal(false);

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

  // User form
  userForm: FormGroup = this.fb.group({
    username: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[A-Za-z0-9._\-]+$/)]],
    fullName: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.maxLength(100), Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    isActive: [true],
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
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

    const role = this.roleFilter();
    if (role) {
      params['role'] = role;
    }

    this.userApi.getAll(params).subscribe({
      next: (response: PaginatedResponse<User>) => {
        this.users.set(response.data);
        this.pagination.set(response.pagination);
      },
      error: (err) => {
        this.userApi.error.set(err?.error?.message || 'Failed to load users');
      },
    });
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    this.currentPage.set(1);
    this.loadUsers();
  }

  onStatusChange(value: string): void {
    this.statusFilter.set(value);
    this.currentPage.set(1);
    this.loadUsers();
  }

  onRoleChange(value: string): void {
    this.roleFilter.set(value);
    this.currentPage.set(1);
    this.loadUsers();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadUsers();
  }

  // ── Create/Edit Dialog ────────────────────────────────

  openCreateDialog(): void {
    this.editingUser.set(null);
    this.formError.set(null);
    this.userForm.reset({ isActive: true });
    this.userForm.get('username')?.enable();
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.userForm.get('password')?.updateValueAndValidity();
    this.showFormDialog.set(true);
  }

  openEditDialog(user: User): void {
    this.editingUser.set(user);
    this.formError.set(null);
    this.userForm.patchValue({
      username: user.username,
      fullName: user.fullName,
      email: user.email || '',
      password: '',
      isActive: user.isActive,
    });
    this.userForm.get('username')?.disable();
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.setValidators([Validators.minLength(6)]);
    this.userForm.get('password')?.updateValueAndValidity();
    this.showFormDialog.set(true);
  }

  closeFormDialog(): void {
    this.showFormDialog.set(false);
    this.editingUser.set(null);
    this.formError.set(null);
  }

  onFormSubmit(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.formError.set(null);
    this.formSubmitting.set(true);

    const editing = this.editingUser();
    if (editing) {
      const dto: UpdateUserDto = {
        fullName: this.userForm.value.fullName,
        email: this.userForm.value.email || undefined,
        isActive: this.userForm.value.isActive,
      };
      const password = this.userForm.value.password;
      if (password) {
        dto.password = password;
      }

      this.userApi.update(editing.id, dto).subscribe({
        next: () => {
          this.formSubmitting.set(false);
          this.closeFormDialog();
          this.loadUsers();
        },
        error: (err) => {
          this.formSubmitting.set(false);
          this.formError.set(err?.error?.message || 'Failed to update user');
        },
      });
    } else {
      const dto: CreateUserDto = {
        username: this.userForm.value.username,
        password: this.userForm.value.password,
        fullName: this.userForm.value.fullName,
        email: this.userForm.value.email || undefined,
      };

      this.userApi.create(dto).subscribe({
        next: () => {
          this.formSubmitting.set(false);
          this.closeFormDialog();
          this.loadUsers();
        },
        error: (err) => {
          this.formSubmitting.set(false);
          this.formError.set(err?.error?.message || 'Failed to create user');
        },
      });
    }
  }

  // ── Role Assignment Dialog ────────────────────────────

  openRoleDialog(user: User): void {
    this.roleDialogUser.set(user);
    this.roleDialogUserRoles.set(user.userRoles ? [...user.userRoles] : []);
    this.roleError.set(null);
    this.showRoleDialog.set(true);
  }

  closeRoleDialog(): void {
    this.showRoleDialog.set(false);
    this.roleDialogUser.set(null);
    this.roleDialogUserRoles.set([]);
    this.roleError.set(null);
    this.loadUsers();
  }

  isRoleAssigned(roleName: RoleName): boolean {
    return this.roleDialogUserRoles().some((ur) => ur.role.name === roleName);
  }

  toggleRole(roleName: RoleName): void {
    if (this.isRoleAssigned(roleName)) {
      const userRole = this.roleDialogUserRoles().find((ur) => ur.role.name === roleName);
      if (userRole) {
        this.removeRole(userRole);
      }
    } else {
      this.assignRole(roleName);
    }
  }

  assignRole(roleName: RoleName): void {
    const user = this.roleDialogUser();
    if (!user) return;

    this.roleSubmitting.set(true);
    this.roleError.set(null);

    // Find role ID from existing roles, or pass role name for backend to resolve
    this.userApi.assignRoles(user.id, [roleName]).subscribe({
      next: () => {
        this.roleSubmitting.set(false);
        // Reload user to get updated roles
        this.userApi.getById(user.id).subscribe({
          next: (updatedUser: User) => {
            this.roleDialogUser.set(updatedUser);
            this.roleDialogUserRoles.set(updatedUser.userRoles || []);
          },
        });
      },
      error: (err) => {
        this.roleSubmitting.set(false);
        this.roleError.set(err?.error?.message || 'Failed to assign role');
      },
    });
  }

  removeRole(userRole: UserRole): void {
    const user = this.roleDialogUser();
    if (!user) return;

    this.roleSubmitting.set(true);
    this.roleError.set(null);

    this.userApi.removeRole(user.id, userRole.roleId).subscribe({
      next: () => {
        this.roleSubmitting.set(false);
        // Update local state
        this.roleDialogUserRoles.update((roles) => roles.filter((ur) => ur.id !== userRole.id));
      },
      error: (err) => {
        this.roleSubmitting.set(false);
        this.roleError.set(err?.error?.message || 'Failed to remove role');
      },
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

  deactivateUser(user: User): void {
    if (!confirm(`Are you sure you want to deactivate "${user.fullName}"?`)) return;

    this.userApi.delete(user.id).subscribe({
      next: () => this.loadUsers(),
      error: (err) => {
        this.userApi.error.set(err?.error?.message || 'Failed to deactivate user');
      },
    });
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.userForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }
}
