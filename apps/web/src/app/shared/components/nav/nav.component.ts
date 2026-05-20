import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

export interface NavSubItem {
  label: string;
  path: string;
  icon: string;
}

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  roles: string[];
  children?: NavSubItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: '📊',
    roles: ['CASHIER', 'STORE', 'SUPERVISOR', 'MANAGER', 'CFO', 'ADMIN'],
  },
  {
    label: 'Master Data',
    path: '/master-data',
    icon: '📋',
    roles: ['ADMIN', 'MANAGER', 'CFO'],
  },
  {
    label: 'Transactions',
    path: '/transactions',
    icon: '💰',
    roles: ['CASHIER', 'STORE', 'SUPERVISOR', 'MANAGER', 'CFO', 'ADMIN'],
    children: [
      { label: 'Job Orders', path: '/transactions/job-orders', icon: '📝' },
      { label: 'Sales / Invoice', path: '/transactions/sales/invoice/create', icon: '🧾' },
      { label: 'Sales CN', path: '/transactions/sales/cn/create', icon: '↩️' },
      { label: 'GR Receive', path: '/transactions/purchasing/gr-receive/create', icon: '📦' },
      { label: 'GR Return', path: '/transactions/purchasing/gr-return/create', icon: '🔄' },
      { label: 'Purchase CN', path: '/transactions/purchasing/cn/create', icon: '📄' },
      { label: 'GR/IR Clearings', path: '/transactions/purchasing/clearings', icon: '⚖️' },
      { label: 'AP (เจ้าหนี้)', path: '/transactions/ap', icon: '💳' },
      { label: 'AR (ลูกหนี้)', path: '/transactions/ar', icon: '💵' },
    ],
  },
  {
    label: 'Warehouse',
    path: '/warehouse',
    icon: '🏭',
    roles: ['STORE', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    label: 'Reports',
    path: '/reports',
    icon: '📈',
    roles: ['SUPERVISOR', 'MANAGER', 'CFO', 'ADMIN'],
  },
];

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="nav" role="navigation" aria-label="Main navigation">
      <ul class="nav-list">
        @for (item of visibleItems(); track item.path) {
          <li class="nav-item">
            @if (item.children) {
              <button
                class="nav-link nav-toggle"
                [class.expanded]="isExpanded(item.path)"
                (click)="toggle(item.path)"
                [attr.aria-expanded]="isExpanded(item.path)"
                [attr.aria-label]="item.label"
              >
                <span class="nav-icon">{{ item.icon }}</span>
                <span class="nav-label">{{ item.label }}</span>
                <span class="nav-arrow">{{ isExpanded(item.path) ? '▾' : '▸' }}</span>
              </button>
              @if (isExpanded(item.path)) {
                <ul class="sub-nav-list">
                  @for (child of item.children; track child.path) {
                    <li class="sub-nav-item">
                      <a
                        [routerLink]="child.path"
                        routerLinkActive="active"
                        class="nav-link sub-nav-link"
                        [attr.aria-label]="child.label"
                      >
                        <span class="nav-icon sub-icon">{{ child.icon }}</span>
                        <span class="nav-label">{{ child.label }}</span>
                      </a>
                    </li>
                  }
                </ul>
              }
            } @else {
              <a
                [routerLink]="item.path"
                routerLinkActive="active"
                class="nav-link"
                [attr.aria-label]="item.label"
              >
                <span class="nav-icon">{{ item.icon }}</span>
                <span class="nav-label">{{ item.label }}</span>
              </a>
            }
          </li>
        }
      </ul>
    </nav>
  `,
  styles: [
    `
      .nav {
        padding: 16px 0;
      }

      .nav-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .nav-item {
        margin-bottom: 4px;
      }

      .nav-link {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 20px;
        color: #e0e0e0;
        border-radius: 4px;
        margin: 0 8px;
        transition: background-color 0.2s;
        text-decoration: none;
        width: calc(100% - 16px);
        border: none;
        background: none;
        cursor: pointer;
        font-family: inherit;

        &:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }

        &.active {
          background-color: rgba(255, 255, 255, 0.15);
          color: #ffffff;
          font-weight: 500;
        }
      }

      .nav-toggle {
        justify-content: flex-start;
        text-align: left;

        &.expanded {
          background-color: rgba(255, 255, 255, 0.05);
        }
      }

      .nav-arrow {
        margin-left: auto;
        font-size: 12px;
        color: #9e9e9e;
      }

      .nav-icon {
        font-size: 18px;
        width: 24px;
        text-align: center;
        flex-shrink: 0;
      }

      .nav-label {
        font-size: 14px;
      }

      .sub-nav-list {
        list-style: none;
        padding: 0;
        margin: 4px 0 4px 0;
      }

      .sub-nav-item {
        margin-bottom: 2px;
      }

      .sub-nav-link {
        padding: 8px 20px 8px 36px;
        font-size: 13px;
      }

      .sub-icon {
        font-size: 14px;
        width: 20px;
      }
    `,
  ],
})
export class NavComponent {
  private readonly authService = inject(AuthService);
  private readonly expandedMenus = signal<Set<string>>(new Set(['/transactions']));

  readonly visibleItems = computed(() => {
    const userRoles = this.authService.roles();
    return NAV_ITEMS.filter((item) =>
      item.roles.some((role) => userRoles.includes(role))
    );
  });

  isExpanded(path: string): boolean {
    return this.expandedMenus().has(path);
  }

  toggle(path: string): void {
    const current = new Set(this.expandedMenus());
    if (current.has(path)) {
      current.delete(path);
    } else {
      current.add(path);
    }
    this.expandedMenus.set(current);
  }
}
