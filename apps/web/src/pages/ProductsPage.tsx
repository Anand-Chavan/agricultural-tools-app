import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, formatINR, uploadUrl } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  MoneyDisplay,
  ProductImage,
  SearchFilterBar,
  StatusBadge,
} from '../components/ui';

type Product = {
  id: string;
  sku: string;
  name: string;
  sellingPrice: number;
  costPrice?: number;
  quantityOnHand: number;
  reorderLevel: number;
  isLowStock: boolean;
  isActive: boolean;
  category: { name: string };
  images: { storageKey: string; altText?: string }[];
};

export function ProductsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'table' | 'cards'>('cards');
  const [showCreate, setShowCreate] = useState(false);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/api/categories'),
  });
  const products = useQuery({
    queryKey: ['products', q],
    queryFn: () => api<{ items: Product[]; total: number }>(`/api/products?q=${encodeURIComponent(q)}&pageSize=50`),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/api/products', { method: 'POST', json: body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      setShowCreate(false);
    },
  });

  const items = products.data?.items || [];
  const categoryOptions = categories.data?.items || [];

  const formDefaults = useMemo(
    () => ({
      sku: '',
      name: '',
      categoryId: categoryOptions[0]?.id || '',
      productType: 'MANUFACTURED',
      unit: 'pcs',
      costPrice: 0,
      sellingPrice: 0,
      reorderLevel: 10,
      description: 'DEMO SAMPLE — replace with confirmed product data.',
    }),
    [categoryOptions],
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
        <div>
          <h1 className="page-title">Products & Catalogue</h1>
          <p className="page-sub mb-0">
            Sample SKUs and prices are examples only. Photos are from the supplied reference PDF.
          </p>
        </div>
        <div className="d-flex gap-2 no-print">
          <button
            type="button"
            className={`btn btn-sm ${view === 'cards' ? 'btn-agri btn-success' : 'btn-outline-secondary'}`}
            onClick={() => setView('cards')}
          >
            Cards
          </button>
          <button
            type="button"
            className={`btn btn-sm ${view === 'table' ? 'btn-agri btn-success' : 'btn-outline-secondary'}`}
            onClick={() => setView('table')}
          >
            Table
          </button>
          {can('products:write') ? (
            <button type="button" className="btn btn-sm btn-agri btn-success" onClick={() => setShowCreate(true)}>
              New product
            </button>
          ) : null}
        </div>
      </div>

      <SearchFilterBar>
        <div className="flex-grow-1">
          <label className="form-label" htmlFor="product-search">
            Search
          </label>
          <input
            id="product-search"
            className="form-control"
            placeholder="Name, SKU, or barcode"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </SearchFilterBar>

      {products.isLoading ? <LoadingState /> : null}
      {products.isError ? (
        <ErrorState message="Could not load products." onRetry={() => void products.refetch()} />
      ) : null}
      {!products.isLoading && items.length === 0 ? (
        <EmptyState title="No products found" hint="Try another search or create a product." />
      ) : null}

      {view === 'cards' && items.length > 0 ? (
        <div className="product-card-grid">
          {items.map((p) => (
            <Link key={p.id} to={`/products/${p.id}`} className="product-card text-decoration-none text-dark">
              <ProductImage
                src={uploadUrl(p.images[0]?.storageKey)}
                alt={p.images[0]?.altText || p.name}
              />
              <div className="p-3">
                <div className="small text-muted">{p.sku}</div>
                <div className="fw-semibold">{p.name}</div>
                <div className="small text-muted">{p.category.name}</div>
                <div className="d-flex justify-content-between align-items-center mt-2">
                  <MoneyDisplay value={p.sellingPrice} />
                  {p.isLowStock ? <StatusBadge status="LOW" /> : <StatusBadge status="OK" />}
                </div>
                <div className="small mt-1">On hand: {p.quantityOnHand}</div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {view === 'table' && items.length > 0 ? (
        <div className="panel table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>Image</th>
                <th>SKU</th>
                <th>Name</th>
                <th>Category</th>
                <th>On hand</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td style={{ width: 64 }}>
                    <ProductImage
                      className="sm"
                      src={uploadUrl(p.images[0]?.storageKey)}
                      alt={p.name}
                    />
                  </td>
                  <td>{p.sku}</td>
                  <td>
                    <Link to={`/products/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.category.name}</td>
                  <td>{p.quantityOnHand}</td>
                  <td>{formatINR(p.sellingPrice)}</td>
                  <td>
                    <StatusBadge status={p.isActive ? (p.isLowStock ? 'LOW' : 'ACTIVE') : 'ARCHIVED'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showCreate ? (
        <CreateProductModal
          defaults={formDefaults}
          categories={categoryOptions}
          canCost={can('products:cost')}
          busy={createMutation.isPending}
          error={createMutation.error ? String((createMutation.error as Error).message) : ''}
          onClose={() => setShowCreate(false)}
          onSubmit={(body) => createMutation.mutate(body)}
        />
      ) : null}
    </div>
  );
}

function CreateProductModal({
  defaults,
  categories,
  canCost,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  defaults: Record<string, string | number>;
  categories: { id: string; name: string }[];
  canCost: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState(defaults);
  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="modal-dialog modal-lg">
        <form
          className="modal-content"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
        >
          <div className="modal-header">
            <h5 className="modal-title">New product</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {error ? <div className="alert alert-danger">{error}</div> : null}
            <div className="row g-3">
              {(
                [
                  ['sku', 'SKU'],
                  ['name', 'Name'],
                  ['unit', 'Unit'],
                  ['sellingPrice', 'Selling price (₹)'],
                  ['reorderLevel', 'Reorder level'],
                ] as const
              ).map(([key, label]) => (
                <div className="col-md-6" key={key}>
                  <label className="form-label">{label}</label>
                  <input
                    className="form-control"
                    value={String(form[key] ?? '')}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [key]: key.includes('Price') || key === 'reorderLevel' ? Number(e.target.value) : e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              ))}
              {canCost ? (
                <div className="col-md-6">
                  <label className="form-label">Cost price (₹)</label>
                  <input
                    className="form-control"
                    type="number"
                    value={Number(form.costPrice)}
                    onChange={(e) => setForm((f) => ({ ...f, costPrice: Number(e.target.value) }))}
                  />
                </div>
              ) : null}
              <div className="col-md-6">
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  value={String(form.categoryId)}
                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Product type</label>
                <select
                  className="form-select"
                  value={String(form.productType)}
                  onChange={(e) => setForm((f) => ({ ...f, productType: e.target.value }))}
                >
                  <option value="MANUFACTURED">Manufactured</option>
                  <option value="RESOLD">Resold</option>
                </select>
              </div>
              <div className="col-12">
                <label className="form-label">Description</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={String(form.description || '')}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-agri btn-success" disabled={busy}>
              {busy ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
