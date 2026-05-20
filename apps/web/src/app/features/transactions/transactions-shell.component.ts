import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-transactions-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="transactions-shell">
      <router-outlet />
    </div>
  `,
  styles: [`
    .transactions-shell {
      padding: 16px;
    }
  `],
})
export class TransactionsShellComponent {}
