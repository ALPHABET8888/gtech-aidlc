import { Routes } from '@angular/router';

export const WAREHOUSE_ROUTES: Routes = [
  {
    path: '',
    children: [
      {
        path: 'count',
        loadChildren: () => Promise.resolve([]),
      },
      {
        path: 'transfers',
        loadChildren: () => Promise.resolve([]),
      },
      {
        path: 'write-offs',
        loadChildren: () => Promise.resolve([]),
      },
      {
        path: '',
        redirectTo: 'count',
        pathMatch: 'full',
      },
    ],
  },
];
