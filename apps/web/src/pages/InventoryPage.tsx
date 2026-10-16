import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, formatDateIST } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  SearchFilterBar,
  StatusBadge,
} from '../components/ui';

export function InventoryPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(params.get('lowStock') === 'true');
  const [adjust, setAdjust] = useState<{ productId: string; name: string } | null>(null);
  const [delta, setDelta] = useState('1');
  const [reason, setReason] = useState('');

  const balances = useQuery({
    queryKey: ['balances', q, lowOnly],
    queryFn: () =>
      api<{ items: any[] }>(
        `/api/inventory/balances?q=${encodeURIComponent(q)}&lowStock=${lowOnly ? 'true' : 'false'}`,
      ),
  });
  const movements = useQuery({
    queryKey: ['movements'],
    queryFn: () => api<{ items: any[] }>('/api/inventory/movements?pageSize=30'),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api('/api/inventory/adjustments', {
        method: 'POST',
        json: {
          productId: adjust!.productId,
          quantityDelta: Number(delta),
          reason,
          movementType: 'MANUAL_ADJUSTMENT',
        },
      }),
    onSuccess: () => {
      setAdjust(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['balances'] });
      void qc.invalidateQueries({ queryKey: ['movements'] });
    },
  });

  const items = useMemo(() => balances.data?.items || [], [balances.data]);

  return (
    <div>
      <h1 className="page-title">Inventory</h1>
      <p className="page-sub">On-hand balances and immutable stock movement ledger.</p>

      <SearchFilterBar>
        <div className="flex-grow-1">
          <label className="form-label">Search</label>
          <input className="form-control" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="form-check mt-4">
          <input
            id="lowOnly"
            className="form-check-input"
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="lowOnly">
            Low stock only
          </label>
        </div>
      </SearchFilterBar>

      {balances.isLoading ? <LoadingState /> : null}
      {balances.isError ? (
        <ErrorState message="Could not load stock." onRetry={() => void balances.refetch()} />
      ) : null}

      <div className="panel table-responsive">
        <table className="table align-middle">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>On hand</th>
              <th>Reorder</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.sku}</td>
                <td>{i.name}</td>
                <td>{i.quantityOnHand}</td>
                <td>{i.reorderLevel}</td>
                <td>
                  <StatusBadge status={i.isLowStock ? 'LOW' : 'OK'} />
                </td>
                <td className="text-end">
                  {can('inventory:adjust') ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setAdjust({ productId: i.productId, name: i.name })}
                    >
                      Adjust
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2 className="h5">Recent movements</h2>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Reason</th>
                <th>User</th>
              </tr>
            </thead>
            <tbody>
              {(movements.data?.items || []).map((m) => (
                <tr key={m.id}>
                  <td>{formatDateIST(m.createdAt)}</td>
                  <td>
                    {m.product.sku} — {m.product.name}
                  </td>
                  <td>{m.movementType}</td>
                  <td>{m.quantityDelta}</td>
                  <td>{m.reason || '—'}</td>
                  <td>{m.createdBy?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(adjust)}
        title="Adjust stock"
        confirmLabel="Post adjustment"
        busy={mutation.isPending}
        onCancel={() => setAdjust(null)}
        onConfirm={() => mutation.mutate()}
        body={
          <div>
            <p>
              Adjusting <strong>{adjust?.name}</strong>. On-hand cannot be edited directly — this posts
              a ledger movement.
            </p>
            <label className="form-label">Quantity delta (+/-)</label>
            <input className="form-control mb-2" value={delta} onChange={(e) => setDelta(e.target.value)} />
            <label className="form-label">Reason</label>
            <textarea className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} />
            {mutation.isError ? (
              <div className="text-danger small mt-2">{(mutation.error as Error).message}</div>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
