import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface MasterDataNavItem {
  label: string;
  path: string;
  icon: string;
}

const MASTER_DATA_NAV_ITEMS: MasterDataNavItem[] = [
  { label: 'Items', path: 'items', icon: '📦' },
  { label: 'Warehouses', path: 'warehouses', icon: '🏭' },
  { label: 'Vendors', path: 'vendors', icon: '🤝' },
  { label: 'Customers', path: 'customers', icon: '👥' },
  { label: 'Users', path: 'users', icon: '👤' },
  { label: 'Periods', path: 'periods', icon: '📅' },
  { label: 'Stock Balance', path: 'stock-balance', icon: '📊' },
  { label: 'TX Log', path: 'tx-log', icon: '📝' },
];

@Component({
  selector: 'app-master-data-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="master-data-layout">
      <aside class="md-sidebar" role="navigation" aria-label="Master Data navigation">
        <h3 class="md-sidebar-title">Master Data</h3>
        <nav>
          <ul class="md-nav-list">
            @for (item of navItems; track item.path) {
              <li class="md-nav-item">
                <a
                  [routerLink]="item.path"
                  routerLinkActive="active"
                  class="md-nav-link"
                  [attr.aria-label]="item.label"
                >
                  <span class="md-nav-icon">{{ item.icon }}</span>
                  <span class="md-nav-label">{{ item.label }}</span>
                </a>
              </li>
            }
          </ul>
        </nav>
      </aside>

      <section class="md-content" role="region" aria-label="Master Data content">
        <router-outlet />
      </section>
    </div>
  `,
  styles: [`
    .master-data-layout {
      display: flex;
      height: 100%;
    }

    .md-sidebar {
      width: 200px;
      background-color: #ffffff;
      border-right: 1px solid #e0e0e0;
      padding: 16px 0;
      overflow-y: auto;
      flex-shrink: 0;
    }

    .md-sidebar-title {
      padding: 0 16px;
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 600;
      color: #616161;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .md-nav-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .md-nav-item {
      margin-bottom: 2px;
    }

    .md-nav-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      color: #424242;
      font-size: 14px;
      text-decoration: none;
      border-radius: 0;
      transition: background-color 0.15s;

      &:hover {
        background-color: #f5f5f5;
      }

      &.active {
        background-color: #e3f2fd;
        color: #1565c0;
        font-weight: 500;
        border-left: 3px solid #1565c0;
        padding-left: 13px;
      }
    }

    .md-nav-icon {
      font-size: 16px;
      width: 20px;
      text-align: center;
    }

    .md-nav-label {
      white-space: nowrap;
    }

    .md-content {
      flex: 1;
      overflow-y: auto;
      background-color: #fafafa;
    }
  `],
})
export class MasterDataShellComponent {
  readonly navItems = MASTER_DATA_NAV_ITEMS;
}
