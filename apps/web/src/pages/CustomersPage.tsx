import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, formatDateIST } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, LoadingState, MoneyDisplay, SearchFilterBar, StatusBadge } from '../components/ui';

export function CustomersPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', billingAddress: '' });

  const customers = useQuery({
    queryKey: ['customers', q],
    queryFn: () => api<{ items: any[] }>(`/api/customers?q=${encodeURIComponent(q)}`),
  });

  const createMut = useMutation({
    mutationFn: () => api('/api/customers', { method: 'POST', json: form }),
    onSuccess: () => {
      setOpen(false);
      setForm({ name: '', phone: '', email: '', billingAddress: '' });
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  return (
    <div>
      <div className="d-flex justify-content-between mb-2">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub mb-0">Search by name/phone. Duplicate phone numbers show a warning.</p>
        </div>
        {can('customers:write') ? (
          <button type="button" className="btn btn-agri btn-success" onClick={() => setOpen(true)}>
            New customer
          </button>
        ) : null}
      </div>
      <SearchFilterBar>
        <div className="flex-grow-1">
          <label className="form-label">Search</label>
          <input className="form-control" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </SearchFilterBar>
      {customers.isLoading ? <LoadingState /> : null}
      {customers.isError ? (
        <ErrorState message="Could not load customers." onRetry={() => void customers.refetch()} />
      ) : null}
      <div className="panel table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th className="text-end">Purchases</th>
              <th className="text-end">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {(customers.data?.items || []).map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to={`/customers/${c.id}`}>{c.name}</Link>
                </td>
                <td>{c.phone || '—'}</td>
                <td className="text-end">
                  <MoneyDisplay value={c.totalPurchases} />
                </td>
                <td className="text-end">
                  <MoneyDisplay value={c.outstandingBalance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="modal-dialog">
            <form
              className="modal-content"
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate();
              }}
            >
              <div className="modal-header">
                <h5 className="modal-title">New customer</h5>
                <button type="button" className="btn-close" onClick={() => setOpen(false)} />
              </div>
              <div className="modal-body">
                {(['name', 'phone', 'email', 'billingAddress'] as const).map((key) => (
                  <div className="mb-2" key={key}>
                    <label className="form-label text-capitalize">{key}</label>
                    <input
                      className="form-control"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      required={key === 'name'}
                    />
                  </div>
                ))}
                {createMut.isError ? (
                  <div className="text-danger">{(createMut.error as Error).message}</div>
                ) : null}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-agri btn-success" disabled={createMut.isPending}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const customer = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<any>(`/api/customers/${id}`),
    enabled: Boolean(id),
  });
  if (customer.isLoading) return <LoadingState />;
  if (customer.isError || !customer.data) {
    return <ErrorState message="Customer not found." onRetry={() => void customer.refetch()} />;
  }
  const c = customer.data;
  return (
    <div>
      <Link to="/customers" className="small">
        ← Customers
      </Link>
      <h1 className="page-title mt-2">{c.name}</h1>
      <p className="page-sub">
        {c.phone || 'No phone'} · Outstanding <MoneyDisplay value={c.outstandingBalance} />
      </p>
      <div className="panel table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Status</th>
              <th className="text-end">Total</th>
              <th className="text-end">Due</th>
            </tr>
          </thead>
          <tbody>
            {c.invoices.map((i: any) => (
              <tr key={i.id}>
                <td>
                  <Link to={`/sales/${i.id}`}>{i.invoiceNumber || 'Draft'}</Link>
                </td>
                <td>{formatDateIST(i.invoiceDate)}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td className="text-end">
                  <MoneyDisplay value={i.grandTotal} />
                </td>
                <td className="text-end">
                  <MoneyDisplay value={i.balanceDue} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
