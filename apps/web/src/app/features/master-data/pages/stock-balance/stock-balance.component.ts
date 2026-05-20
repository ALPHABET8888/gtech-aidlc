import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-stock-balance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-container">
      <h2>Stock Balance</h2>
      <p>Stock balance viewer (to be implemented in task 8.6)</p>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 24px;
    }
  `],
})
export class StockBalanceComponent {}
