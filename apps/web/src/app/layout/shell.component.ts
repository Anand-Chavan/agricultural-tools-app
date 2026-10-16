import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';

type NavItem = { path: string; label: string; perm: string; exact?: boolean };

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-shell">
      <aside class="sidebar no-print">
        <div class="brand-block">
          <p class="brand-name">Agricultural Tools</p>
          <div class="brand-sub">Business Management</div>
        </div>
        <nav aria-label="Main">
          @for (link of visibleLinks(); track link.path) {
            <a
              class="nav-link-agri"
              [routerLink]="link.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: !!link.exact }"
              >{{ link.label }}</a
            >
          }
        </nav>
      </aside>
      <div class="main-column">
        <header class="topbar no-print">
          <div>
            <div class="fw-semibold">Agricultural Tools Co. (Demo)</div>
            <div class="small text-muted">Asia/Kolkata · INR</div>
          </div>
          <div class="d-flex align-items-center gap-3">
            <div class="text-end small">
              <div class="fw-semibold">{{ auth.user()?.name }}</div>
              <div class="text-muted">{{ auth.user()?.role }}</div>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary" (click)="logout()">Sign out</button>
          </div>
        </header>
        <main class="page">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent {
  readonly auth = inject(AuthService);

  private readonly links: NavItem[] = [
    { path: '/', label: 'Dashboard', perm: 'dashboard:read', exact: true },
    { path: '/products', label: 'Products', perm: 'products:read' },
    { path: '/inventory', label: 'Inventory', perm: 'inventory:read' },
    { path: '/purchases', label: 'Purchases', perm: 'purchases:read' },
    { path: '/suppliers', label: 'Suppliers', perm: 'purchases:read' },
    { path: '/sales', label: 'Sales & Billing', perm: 'sales:read' },
    { path: '/customers', label: 'Customers', perm: 'customers:read' },
    { path: '/reports', label: 'Reports', perm: 'reports:read' },
    { path: '/users', label: 'Users & Roles', perm: 'users:manage' },
    { path: '/settings', label: 'Settings', perm: 'settings:manage' },
    { path: '/audit', label: 'Audit Log', perm: 'audit:read' },
  ];

  visibleLinks() {
    return this.links.filter((l) => this.auth.can(l.perm));
  }

  logout() {
    void this.auth.logout();
  }
}
