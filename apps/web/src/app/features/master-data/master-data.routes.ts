import { Route } from '@angular/router';
import { adminGuard, roleGuard } from '../../core/guards/role.guard';

export const MASTER_DATA_ROUTES: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./master-data-shell.component').then(
        (m) => m.MasterDataShellComponent
      ),
    children: [
      {
        path: 'items',
        loadComponent: () =>
          import('./pages/item-list/item-list.component').then(
            (m) => m.ItemListComponent
          ),
      },
      {
        path: 'items/new',
        loadComponent: () =>
          import('./pages/item-form/item-form.component').then(
            (m) => m.ItemFormComponent
          ),
      },
      {
        path: 'items/:id/edit',
        loadComponent: () =>
          import('./pages/item-form/item-form.component').then(
            (m) => m.ItemFormComponent
          ),
      },
      {
        path: 'warehouses',
        loadComponent: () =>
          import('./pages/warehouse-list/warehouse-list.component').then(
            (m) => m.WarehouseListComponent
          ),
      },
      {
        path: 'warehouses/new',
        loadComponent: () =>
          import('./pages/warehouse-form/warehouse-form.component').then(
            (m) => m.WarehouseFormComponent
          ),
      },
      {
        path: 'warehouses/:id/edit',
        loadComponent: () =>
          import('./pages/warehouse-form/warehouse-form.component').then(
            (m) => m.WarehouseFormComponent
          ),
      },
      {
        path: 'vendors',
        loadComponent: () =>
          import('./pages/vendor-list/vendor-list.component').then(
            (m) => m.VendorListComponent
          ),
      },
      {
        path: 'vendors/new',
        loadComponent: () =>
          import('./pages/vendor-form/vendor-form.component').then(
            (m) => m.VendorFormComponent
          ),
      },
      {
        path: 'vendors/:id/edit',
        loadComponent: () =>
          import('./pages/vendor-form/vendor-form.component').then(
            (m) => m.VendorFormComponent
          ),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./pages/customer-list/customer-list.component').then(
            (m) => m.CustomerListComponent
          ),
      },
      {
        path: 'customers/new',
        loadComponent: () =>
          import('./pages/customer-form/customer-form.component').then(
            (m) => m.CustomerFormComponent
          ),
      },
      {
        path: 'customers/:id/edit',
        loadComponent: () =>
          import('./pages/customer-form/customer-form.component').then(
            (m) => m.CustomerFormComponent
          ),
      },
      // User management — Admin-only access
      {
        path: 'users',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/user-list/user-list.component').then(
            (m) => m.UserListComponent
          ),
      },
      {
        path: 'users/new',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/user-form/user-form.component').then(
            (m) => m.UserFormComponent
          ),
      },
      {
        path: 'users/:id/edit',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/user-form/user-form.component').then(
            (m) => m.UserFormComponent
          ),
      },
      {
        path: 'periods',
        canActivate: [roleGuard('CFO', 'ADMIN')],
        loadComponent: () =>
          import('./pages/period-management/period-management.component').then(
            (m) => m.PeriodManagementComponent
          ),
      },
      {
        path: 'stock-balance',
        loadComponent: () =>
          import('./pages/stock-balance/stock-balance.component').then(
            (m) => m.StockBalanceComponent
          ),
      },
      {
        path: 'tx-log',
        loadComponent: () =>
          import('./pages/tx-log-viewer/tx-log-viewer.component').then(
            (m) => m.TxLogViewerComponent
          ),
      },
      {
        path: '',
        redirectTo: 'items',
        pathMatch: 'full',
      },
    ],
  },
];
