import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ConfirmDialog, ErrorState, LoadingState, MoneyDisplay, StatusBadge } from '../components/ui';

export function PurchasesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveId, setReceiveId] = useState<string | null>(null);

  const purchases = useQuery({
    queryKey: ['purchases'],
    queryFn: () => api<{ items: any[] }>('/api/purchases'),
  });
  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<{ items: any[] }>('/api/suppliers'),
  });
  const products = useQuery({
    queryKey: ['products-mini'],
    queryFn: () => api<{ items: any[] }>('/api/products?pageSize=100'),
  });

  const createMut = useMutation({
    mutationFn: (body: any) => api('/api/purchases', { method: 'POST', json: body }),
    onSuccess: () => {
      setCreateOpen(false);
      void qc.invalidateQueries({ queryKey: ['purchases'] });
    },
  });

  const receiveMut = useMutation({
    mutationFn: async () => {
      const detail = await api<any>(`/api/purchases/${receiveId}`);
      return api(`/api/purchases/${receiveId}/receive`, {
        method: 'POST',
        json: {
          items: detail.items.map((i: any) => ({
            purchaseItemId: i.id,
            quantityReceived: Number(i.quantityOrdered) - Number(i.quantityReceived),
          })),
        },
      });
    },
    onSuccess: () => {
      setReceiveId(null);
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      void qc.invalidateQueries({ queryKey: ['balances'] });
    },
  });

  if (purchases.isLoading) return <LoadingState />;
  if (purchases.isError) {
    return <ErrorState message="Could not load purchases." onRetry={() => void purchases.refetch()} />;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div>
          <h1 className="page-title">Purchases</h1>
          <p className="page-sub mb-0">Draft orders do not change stock. Receiving does, exactly once per quantity.</p>
        </div>
        {can('purchases:write') ? (
          <button type="button" className="btn btn-agri btn-success" onClick={() => setCreateOpen(true)}>
            New purchase
          </button>
        ) : null}
      </div>

      <div className="panel table-responsive">
        <table className="table align-middle">
          <thead>
            <tr>
              <th>PO</th>
              <th>Supplier</th>
              <th>Status</th>
              <th className="text-end">Total</th>
              <th className="text-end">Due</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {purchases.data!.items.map((p) => (
              <tr key={p.id}>
                <td>{p.purchaseNumber}</td>
                <td>{p.supplier?.name}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td className="text-end">
                  <MoneyDisplay value={p.grandTotal} />
                </td>
                <td className="text-end">
                  <MoneyDisplay value={p.balanceDue} />
                </td>
                <td className="text-end">
                  {can('purchases:receive') && p.status !== 'RECEIVED' && p.status !== 'CANCELLED' ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setReceiveId(p.id)}
                    >
                      Receive
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="small">
        Manage supplier directory on <Link to="/suppliers">Suppliers</Link>.
      </p>

      {createOpen ? (
        <CreatePurchaseModal
          suppliers={suppliers.data?.items || []}
          products={products.data?.items || []}
          busy={createMut.isPending}
          error={createMut.error ? (createMut.error as Error).message : ''}
          onClose={() => setCreateOpen(false)}
          onSubmit={(body) => createMut.mutate(body)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(receiveId)}
        title="Receive purchase"
        confirmLabel="Receive remaining qty"
        busy={receiveMut.isPending}
        onCancel={() => setReceiveId(null)}
        onConfirm={() => receiveMut.mutate()}
        body={
          <div>
            <p>This will increase stock for unordered remaining quantities and write ledger movements.</p>
            {receiveMut.isError ? (
              <div className="text-danger">{(receiveMut.error as Error).message}</div>
            ) : null}
          </div>
        }
      />
    </div>
  );
}

function CreatePurchaseModal({
  suppliers,
  products,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  suppliers: any[];
  products: any[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (body: any) => void;
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [qty, setQty] = useState(10);
  const [unitCost, setUnitCost] = useState(products[0]?.costPrice || 0);

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="modal-dialog">
        <form
          className="modal-content"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              supplierId,
              otherCharges: 0,
              items: [
                {
                  productId,
                  quantityOrdered: qty,
                  unitCost,
                  discount: 0,
                  taxRateSnapshot: 18,
                },
              ],
            });
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title">New draft purchase</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {error ? <div className="alert alert-danger">{error}</div> : null}
            <label className="form-label">Supplier</label>
            <select className="form-select mb-2" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="form-label">Product</label>
            <select
              className="form-select mb-2"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((x) => x.id === e.target.value);
                if (p?.costPrice != null) setUnitCost(p.costPrice);
              }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
            <label className="form-label">Qty ordered</label>
            <input
              className="form-control mb-2"
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
            <label className="form-label">Unit cost (₹)</label>
            <input
              className="form-control"
              type="number"
              value={unitCost}
              onChange={(e) => setUnitCost(Number(e.target.value))}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-agri btn-success" disabled={busy}>
              Save draft
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SuppliersPage() {
  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api<{ items: any[] }>('/api/suppliers'),
  });
  if (suppliers.isLoading) return <LoadingState />;
  return (
    <div>
      <h1 className="page-title">Suppliers</h1>
      <p className="page-sub">Supplier directory and payables context.</p>
      <div className="panel table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Phone</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {(suppliers.data?.items || []).map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.contactName || '—'}</td>
                <td>{s.phone || '—'}</td>
                <td>{s.email || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
