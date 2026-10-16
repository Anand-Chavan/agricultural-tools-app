import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatDateIST } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  MoneyDisplay,
  StatusBadge,
} from '../components/ui';

export function SalesPage() {
  const { can } = useAuth();
  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api<{ items: any[] }>('/api/invoices'),
  });

  if (invoices.isLoading) return <LoadingState />;
  if (invoices.isError) {
    return <ErrorState message="Could not load invoices." onRetry={() => void invoices.refetch()} />;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div>
          <h1 className="page-title">Sales & Billing</h1>
          <p className="page-sub mb-0">Create drafts, issue invoices, record partial payments, print A4 invoices.</p>
        </div>
        {can('sales:write') ? (
          <Link className="btn btn-agri btn-success" to="/sales/new">
            New invoice
          </Link>
        ) : null}
      </div>
      <div className="panel table-responsive">
        <table className="table align-middle">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Status</th>
              <th className="text-end">Total</th>
              <th className="text-end">Due</th>
            </tr>
          </thead>
          <tbody>
            {invoices.data!.items.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link to={`/sales/${i.id}`}>{i.invoiceNumber || 'Draft'}</Link>
                </td>
                <td>{i.customer?.name || i.walkInName || '—'}</td>
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

export function NewInvoicePage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: () => api<{ items: any[] }>('/api/customers'),
  });
  const products = useQuery({
    queryKey: ['products-mini'],
    queryFn: () => api<{ items: any[] }>('/api/products?pageSize=100'),
  });
  const [customerId, setCustomerId] = useState('');
  const [walkInName, setWalkInName] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('CASH');
  const [preview, setPreview] = useState<any>(null);

  const productList = products.data?.items || [];
  const selected = productList.find((p) => p.id === productId) || productList[0];

  const createMut = useMutation({
    mutationFn: async () => {
      const pid = productId || selected?.id;
      if (!pid) throw new Error('Select a product');
      const draft = await api<any>('/api/invoices', {
        method: 'POST',
        json: {
          customerId: customerId || null,
          walkInName: customerId ? null : walkInName || 'Walk-in',
          items: [{ productId: pid, quantity: qty }],
        },
      });
      return draft;
    },
    onSuccess: (draft) => setPreview(draft),
  });

  const issueMut = useMutation({
    mutationFn: () =>
      api(`/api/invoices/${preview.id}/issue`, {
        method: 'POST',
        json: { amount: payAmount, method: payMethod },
      }),
    onSuccess: (inv: any) => navigate(`/sales/${inv.id}`),
  });

  if (!can('sales:write')) return <ErrorState message="You cannot create invoices." />;
  if (customers.isLoading || products.isLoading) return <LoadingState />;

  return (
    <div>
      <Link to="/sales" className="small">
        ← Back
      </Link>
      <h1 className="page-title mt-2">New invoice</h1>
      <p className="page-sub">Totals are recalculated on the server when you save and issue.</p>

      <div className="panel">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Customer</label>
            <select
              className="form-select"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Walk-in customer</option>
              {(customers.data?.items || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>
          {!customerId ? (
            <div className="col-md-6">
              <label className="form-label">Walk-in name</label>
              <input
                className="form-control"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder="Optional display name"
              />
            </div>
          ) : null}
          <div className="col-md-6">
            <label className="form-label">Product</label>
            <select
              className="form-select"
              value={productId || selected?.id || ''}
              onChange={(e) => setProductId(e.target.value)}
            >
              {productList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name} (stock {p.quantityOnHand})
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Quantity</label>
            <input
              className="form-control"
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Unit price (ref)</label>
            <div className="form-control-plaintext">
              <MoneyDisplay value={selected?.sellingPrice || 0} />
            </div>
          </div>
        </div>
        <div className="mt-3 d-flex gap-2">
          <button
            type="button"
            className="btn btn-agri btn-success"
            disabled={createMut.isPending}
            onClick={() => {
              if (!productId && selected) setProductId(selected.id);
              createMut.mutate();
            }}
          >
            {createMut.isPending ? 'Saving draft…' : 'Preview draft'}
          </button>
        </div>
        {createMut.isError ? (
          <div className="text-danger mt-2">{(createMut.error as Error).message}</div>
        ) : null}
      </div>

      {preview ? (
        <div className="panel">
          <h2 className="h5">Preview before issue</h2>
          <p>
            Draft total <MoneyDisplay value={preview.grandTotal} /> (tax{' '}
            <MoneyDisplay value={preview.taxTotal} />)
          </p>
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label">Amount paid now</label>
              <input
                className="form-control"
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Payment method</label>
              <select className="form-select" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <button
                type="button"
                className="btn btn-agri btn-success"
                disabled={issueMut.isPending || !can('sales:issue')}
                onClick={() => issueMut.mutate()}
              >
                {issueMut.isPending ? 'Issuing…' : 'Issue invoice'}
              </button>
            </div>
          </div>
          {issueMut.isError ? (
            <div className="alert alert-danger mt-3 mb-0">{(issueMut.error as Error).message}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('UPI');
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const invoice = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api<any>(`/api/invoices/${id}`),
    enabled: Boolean(id),
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('/api/settings'),
  });

  const payMut = useMutation({
    mutationFn: () =>
      api(`/api/invoices/${id}/payments`, {
        method: 'POST',
        json: { amount, method },
      }),
    onSuccess: () => {
      setPayOpen(false);
      void qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });

  const voidMut = useMutation({
    mutationFn: () =>
      api(`/api/invoices/${id}/void`, {
        method: 'POST',
        json: { reason: voidReason },
      }),
    onSuccess: () => {
      setVoidOpen(false);
      void qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });

  if (invoice.isLoading) return <LoadingState />;
  if (invoice.isError || !invoice.data) {
    return <ErrorState message="Invoice not found." onRetry={() => void invoice.refetch()} />;
  }
  const inv = invoice.data;
  const biz = settings.data?.settings || {};

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start no-print mb-2">
        <div>
          <Link to="/sales" className="small">
            ← Invoices
          </Link>
          <h1 className="page-title mt-2">{inv.invoiceNumber || 'Draft invoice'}</h1>
          <p className="page-sub mb-0">
            <StatusBadge status={inv.status} /> · {formatDateIST(inv.invoiceDate)}
          </p>
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => window.print()}>
            Print
          </button>
          {can('sales:pay') && Number(inv.balanceDue) > 0 && inv.status !== 'VOIDED' ? (
            <button type="button" className="btn btn-agri btn-success" onClick={() => setPayOpen(true)}>
              Record payment
            </button>
          ) : null}
          {can('sales:void') && !['DRAFT', 'VOIDED'].includes(inv.status) ? (
            <button type="button" className="btn btn-outline-danger" onClick={() => setVoidOpen(true)}>
              Void
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel invoice-print">
        <div className="d-flex justify-content-between mb-3">
          <div>
            <h2 className="h4 mb-1">{biz.businessName || 'Agricultural Tools Co. (Demo)'}</h2>
            <div className="small text-muted" style={{ whiteSpace: 'pre-line' }}>
              {biz.address}
              {'\n'}
              {biz.phone} · {biz.email}
              {'\n'}
              GSTIN: {biz.gstin}
            </div>
          </div>
          <div className="text-end">
            <div className="fw-semibold">Tax Invoice</div>
            <div>{inv.invoiceNumber || 'DRAFT'}</div>
            <div>{formatDateIST(inv.invoiceDate)}</div>
          </div>
        </div>
        <div className="mb-3">
          <div className="text-muted small">Bill to</div>
          <div className="fw-semibold">{inv.customer?.name || inv.walkInName || 'Walk-in'}</div>
          <div className="small">{inv.customer?.billingAddress || inv.customer?.phone || ''}</div>
        </div>
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th className="text-end">Qty</th>
              <th className="text-end">Price</th>
              <th className="text-end">Tax</th>
              <th className="text-end">Line total</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((item: any) => (
              <tr key={item.id}>
                <td>{item.productNameSnapshot}</td>
                <td>{item.skuSnapshot}</td>
                <td className="text-end">{item.quantity}</td>
                <td className="text-end">
                  <MoneyDisplay value={item.unitPrice} />
                </td>
                <td className="text-end">
                  <MoneyDisplay value={item.taxAmount} />
                </td>
                <td className="text-end">
                  <MoneyDisplay value={item.lineTotal} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="d-flex justify-content-end">
          <div style={{ minWidth: 260 }}>
            <div className="d-flex justify-content-between">
              <span>Subtotal</span>
              <MoneyDisplay value={inv.subtotal} />
            </div>
            <div className="d-flex justify-content-between">
              <span>Discount</span>
              <MoneyDisplay value={inv.discountTotal} />
            </div>
            <div className="d-flex justify-content-between">
              <span>Tax</span>
              <MoneyDisplay value={inv.taxTotal} />
            </div>
            <div className="d-flex justify-content-between fw-bold border-top pt-2 mt-2">
              <span>Grand total</span>
              <MoneyDisplay value={inv.grandTotal} />
            </div>
            <div className="d-flex justify-content-between">
              <span>Amount paid</span>
              <MoneyDisplay value={inv.amountPaid} />
            </div>
            <div className="d-flex justify-content-between">
              <span>Balance due</span>
              <MoneyDisplay value={inv.balanceDue} />
            </div>
          </div>
        </div>
        <p className="small text-muted mt-3 mb-0">{biz.invoiceTerms}</p>
        <p className="small text-muted">{biz.taxWarning}</p>
      </div>

      <div className="panel no-print">
        <h2 className="h5">Payments</h2>
        {(inv.payments || []).length === 0 ? (
          <p className="text-muted mb-0">No payments recorded.</p>
        ) : (
          <ul className="mb-0">
            {inv.payments.map((p: any) => (
              <li key={p.id}>
                {formatDateIST(p.paidAt)} — <MoneyDisplay value={p.amount} /> via {p.method}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={payOpen}
        title="Record payment"
        confirmLabel="Save payment"
        busy={payMut.isPending}
        onCancel={() => setPayOpen(false)}
        onConfirm={() => payMut.mutate()}
        body={
          <div>
            <label className="form-label">Amount</label>
            <input
              className="form-control mb-2"
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <label className="form-label">Method</label>
            <select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
              {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {payMut.isError ? <div className="text-danger mt-2">{(payMut.error as Error).message}</div> : null}
          </div>
        }
      />

      <ConfirmDialog
        open={voidOpen}
        title="Void invoice"
        confirmLabel="Void invoice"
        busy={voidMut.isPending}
        onCancel={() => setVoidOpen(false)}
        onConfirm={() => voidMut.mutate()}
        body={
          <div>
            <p>Voiding restocks sold quantities and clears balances. This cannot be undone.</p>
            <label className="form-label">Reason</label>
            <textarea
              className="form-control"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
            {voidMut.isError ? <div className="text-danger mt-2">{(voidMut.error as Error).message}</div> : null}
          </div>
        }
      />
    </div>
  );
}
