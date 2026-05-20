import { Routes } from '@angular/router';

/**
 * Lazy-loaded routes for the Transactions feature module.
 * Child routes will be added as pages are implemented in Tasks 2.4, 3.3, 4.3.
 */
export const transactionsRoutes: Routes = [
  {
    path: '',
    children: [
      {
        path: 'job-orders',
        loadComponent: () =>
          import('./pages/job-order/job-order-list.component').then(
            (m) => m.JobOrderListComponent
          ),
      },
      {
        path: 'job-orders/create',
        loadComponent: () =>
          import('./pages/job-order/job-order-create.component').then(
            (m) => m.JobOrderCreateComponent
          ),
      },
      {
        path: 'job-orders/:id',
        loadComponent: () =>
          import('./pages/job-order/job-order-detail.component').then(
            (m) => m.JobOrderDetailComponent
          ),
      },
      {
        path: 'sales/invoice/create',
        loadComponent: () =>
          import('./pages/sales/invoice-create.component').then(
            (m) => m.InvoiceCreateComponent
          ),
      },
      {
        path: 'sales/cn/create',
        loadComponent: () =>
          import('./pages/sales/sales-cn-create.component').then(
            (m) => m.SalesCnCreateComponent
          ),
      },
      {
        path: 'purchasing/gr-receive/create',
        loadComponent: () =>
          import('./pages/purchasing/gr-receive-create.component').then(
            (m) => m.GrReceiveCreateComponent
          ),
      },
      {
        path: 'purchasing/gr-return/create',
        loadComponent: () =>
          import('./pages/purchasing/gr-return-create.component').then(
            (m) => m.GrReturnCreateComponent
          ),
      },
      {
        path: 'purchasing/cn/create',
        loadComponent: () =>
          import('./pages/purchasing/purchase-cn-create.component').then(
            (m) => m.PurchaseCnCreateComponent
          ),
      },
      {
        path: 'purchasing/clearings',
        loadComponent: () =>
          import('./pages/purchasing/gr-ir-clearing-list.component').then(
            (m) => m.GrIrClearingListComponent
          ),
      },
      {
        path: 'ap',
        loadComponent: () =>
          import('./pages/ap-ar/ap-list.component').then(
            (m) => m.ApListComponent
          ),
      },
      {
        path: 'ap/payment',
        loadComponent: () =>
          import('./pages/ap-ar/ap-payment.component').then(
            (m) => m.ApPaymentComponent
          ),
      },
      {
        path: 'ar',
        loadComponent: () =>
          import('./pages/ap-ar/ar-list.component').then(
            (m) => m.ArListComponent
          ),
      },
      {
        path: 'ar/payment',
        loadComponent: () =>
          import('./pages/ap-ar/ar-payment.component').then(
            (m) => m.ArPaymentComponent
          ),
      },
      {
        path: '',
        redirectTo: 'job-orders',
        pathMatch: 'full',
      },
    ],
  },
];
