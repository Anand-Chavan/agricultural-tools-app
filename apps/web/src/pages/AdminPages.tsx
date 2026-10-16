import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatDateIST } from '../api/client';
import { ErrorState, LoadingState, StatusBadge } from '../components/ui';

export function UsersPage() {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ items: any[] }>('/api/users'),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<{ items: any[] }>('/api/roles'),
  });
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: 'ChangeMe123!',
    roleId: '',
  });

  const createMut = useMutation({
    mutationFn: () =>
      api('/api/users', {
        method: 'POST',
        json: { ...form, roleId: form.roleId || roles.data?.items[0]?.id },
      }),
    onSuccess: () => {
      setForm({ name: '', email: '', password: 'ChangeMe123!', roleId: '' });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  if (users.isLoading) return <LoadingState />;
  if (users.isError) return <ErrorState message="Admin access required." />;

  return (
    <div>
      <h1 className="page-title">Users & Roles</h1>
      <p className="page-sub">Admin-managed staff accounts. No public self-registration.</p>
      <div className="panel">
        <h2 className="h5">Create user</h2>
        <div className="row g-2">
          <div className="col-md-3">
            <input
              className="form-control"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="col-md-3">
            <input
              className="form-control"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="col-md-2">
            <input
              className="form-control"
              placeholder="Temp password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div className="col-md-2">
            <select
              className="form-select"
              value={form.roleId || roles.data?.items[0]?.id || ''}
              onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
            >
              {(roles.data?.items || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <button
              type="button"
              className="btn btn-agri btn-success w-100"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
            >
              Add
            </button>
          </div>
        </div>
      </div>
      <div className="panel table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
            </tr>
          </thead>
          <tbody>
            {(users.data?.items || []).map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  <StatusBadge status={u.isActive ? 'ACTIVE' : 'DISABLED'} />
                </td>
                <td>{formatDateIST(u.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('/api/settings'),
  });
  const [form, setForm] = useState<any>(null);

  const saveMut = useMutation({
    mutationFn: () => api('/api/settings', { method: 'PUT', json: form }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  if (settings.isLoading) return <LoadingState />;
  if (settings.isError) return <ErrorState message="Admin settings access required." />;
  const current = form || settings.data.settings;

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Business profile, invoice prefix, payment methods, and tax configuration.</p>
      <div className="alert alert-warning">
        {settings.data.settings.taxWarning ||
          'Tax configuration must be confirmed by the business accountant before production use.'}
      </div>
      <div className="panel">
        <div className="row g-3">
          {(
            [
              ['businessName', 'Business name'],
              ['phone', 'Phone'],
              ['email', 'Email'],
              ['gstin', 'GSTIN'],
              ['invoicePrefix', 'Invoice prefix'],
            ] as const
          ).map(([key, label]) => (
            <div className="col-md-6" key={key}>
              <label className="form-label">{label}</label>
              <input
                className="form-control"
                value={current[key] || ''}
                onChange={(e) => setForm({ ...current, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="col-12">
            <label className="form-label">Address</label>
            <textarea
              className="form-control"
              rows={3}
              value={current.address || ''}
              onChange={(e) => setForm({ ...current, address: e.target.value })}
            />
          </div>
          <div className="col-md-6">
            <div className="form-check mt-4">
              <input
                className="form-check-input"
                type="checkbox"
                id="allowNeg"
                checked={Boolean(current.allowNegativeStock)}
                onChange={(e) => setForm({ ...current, allowNegativeStock: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="allowNeg">
                Allow negative stock (off by default)
              </label>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-agri btn-success mt-3"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
        >
          Save settings
        </button>
      </div>
      <div className="panel">
        <h2 className="h5">Tax rates</h2>
        <ul className="mb-0">
          {(settings.data.taxRates || []).map((t: any) => (
            <li key={t.id}>
              {t.name}: {t.rate}%
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AuditPage() {
  const logs = useQuery({
    queryKey: ['audit'],
    queryFn: () => api<{ items: any[] }>('/api/audit-logs'),
  });
  if (logs.isLoading) return <LoadingState />;
  if (logs.isError) return <ErrorState message="Audit access required." />;
  return (
    <div>
      <h1 className="page-title">Audit log</h1>
      <p className="page-sub">Sensitive actions with safe before/after summaries. Secrets are never logged.</p>
      <div className="panel table-responsive">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
            </tr>
          </thead>
          <tbody>
            {(logs.data?.items || []).map((l) => (
              <tr key={l.id}>
                <td>{formatDateIST(l.createdAt)}</td>
                <td>{l.user?.name || '—'}</td>
                <td>{l.action}</td>
                <td>
                  {l.entityType} {l.entityId || ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
