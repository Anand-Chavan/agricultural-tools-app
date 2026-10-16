import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const links = [
  { to: '/', label: 'Dashboard', perm: 'dashboard:read', end: true },
  { to: '/products', label: 'Products', perm: 'products:read' },
  { to: '/inventory', label: 'Inventory', perm: 'inventory:read' },
  { to: '/purchases', label: 'Purchases', perm: 'purchases:read' },
  { to: '/suppliers', label: 'Suppliers', perm: 'purchases:read' },
  { to: '/sales', label: 'Sales & Billing', perm: 'sales:read' },
  { to: '/customers', label: 'Customers', perm: 'customers:read' },
  { to: '/reports', label: 'Reports', perm: 'reports:read' },
  { to: '/users', label: 'Users & Roles', perm: 'users:manage' },
  { to: '/settings', label: 'Settings', perm: 'settings:manage' },
  { to: '/audit', label: 'Audit Log', perm: 'audit:read' },
];

export function AppShell() {
  const { user, logout, can } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <div className="brand-block">
          <p className="brand-name">Agricultural Tools</p>
          <div className="brand-sub">Business Management</div>
        </div>
        <nav aria-label="Main">
          {links
            .filter((l) => can(l.perm))
            .map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => `nav-link-agri${isActive ? ' active' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <div className="main-column">
        <header className="topbar no-print">
          <div>
            <div className="fw-semibold">Agricultural Tools Co. (Demo)</div>
            <div className="small text-muted">Asia/Kolkata · INR</div>
          </div>
          <div className="d-flex align-items-center gap-3">
            <div className="text-end small">
              <div className="fw-semibold">{user?.name}</div>
              <div className="text-muted">{user?.role}</div>
            </div>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
