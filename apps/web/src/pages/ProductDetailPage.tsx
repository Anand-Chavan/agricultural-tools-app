import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, formatDateIST, formatINR, uploadUrl } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, LoadingState, MoneyDisplay, ProductImage, StatusBadge } from '../components/ui';

export function ProductDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const product = useQuery({
    queryKey: ['product', id],
    queryFn: () => api<any>(`/api/products/${id}`),
    enabled: Boolean(id),
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !id) throw new Error('Select an image');
      const fd = new FormData();
      fd.append('image', file);
      return api(`/api/products/${id}/images`, { method: 'POST', formData: fd });
    },
    onSuccess: () => {
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['product', id] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  if (product.isLoading) return <LoadingState />;
  if (product.isError || !product.data) {
    return <ErrorState message="Product not found." onRetry={() => void product.refetch()} />;
  }
  const p = product.data;

  return (
    <div>
      <Link to="/products" className="small no-print">
        ← Back to products
      </Link>
      <h1 className="page-title mt-2">{p.name}</h1>
      <p className="page-sub">
        {p.sku} · {p.category?.name} · <StatusBadge status={p.isActive ? 'ACTIVE' : 'ARCHIVED'} />
      </p>

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="panel">
            <ProductImage
              src={uploadUrl(p.images?.[0]?.storageKey)}
              alt={p.images?.[0]?.altText || p.name}
            />
            {can('products:write') ? (
              <div className="mt-3">
                <label className="form-label">Upload / replace photo</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="form-control"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-agri btn-success mt-2"
                  disabled={!file || upload.isPending}
                  onClick={() => upload.mutate()}
                >
                  {upload.isPending ? 'Uploading…' : 'Upload image'}
                </button>
                {upload.isError ? (
                  <div className="text-danger small mt-1">{(upload.error as Error).message}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="col-lg-8">
          <div className="panel">
            <div className="row g-3">
              <div className="col-md-4">
                <div className="text-muted small">Selling price</div>
                <div className="fs-5">
                  <MoneyDisplay value={p.sellingPrice} />
                </div>
              </div>
              {p.costPrice != null ? (
                <div className="col-md-4">
                  <div className="text-muted small">Cost price</div>
                  <div className="fs-5">{formatINR(p.costPrice)}</div>
                </div>
              ) : null}
              <div className="col-md-4">
                <div className="text-muted small">On hand</div>
                <div className="fs-5">{p.quantityOnHand}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small">Reorder level</div>
                <div>{p.reorderLevel}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small">Type</div>
                <div>{p.productType}</div>
              </div>
              <div className="col-md-4">
                <div className="text-muted small">Unit</div>
                <div>{p.unit}</div>
              </div>
              <div className="col-12">
                <div className="text-muted small">Description</div>
                <div>{p.description || '—'}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2 className="h5">Stock movements</h2>
            <div className="table-responsive">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Qty</th>
                    <th>Reason</th>
                    <th>User</th>
                  </tr>
                </thead>
                <tbody>
                  {(p.movements || []).map((m: any) => (
                    <tr key={m.id}>
                      <td>{formatDateIST(m.createdAt)}</td>
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
        </div>
      </div>
    </div>
  );
}
