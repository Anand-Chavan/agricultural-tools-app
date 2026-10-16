import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { ErrorState, LoadingState, MoneyDisplay, StatusBadge } from '../components/ui';

export function ReportsPage() {
  const [tab, setTab] = useState<'sales' | 'stock' | 'receivables' | 'purchases'>('sales');
  const q = useQuery({
    queryKey: ['report', tab],
    queryFn: () => api<any>(`/api/reports/${tab}`),
  });

  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">Server-side reports with CSV export. Gross profit is only shown where cost basis exists.</p>
      <div className="d-flex flex-wrap gap-2 mb-3 no-print">
        {(['sales', 'stock', 'receivables', 'purchases'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`btn btn-sm ${tab === t ? 'btn-agri btn-success' : 'btn-outline-secondary'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
        <a className="btn btn-sm btn-outline-secondary" href={`/api/reports/${tab}?format=csv`}>
          Export CSV
        </a>
      </div>
      {q.isLoading ? <LoadingState /> : null}
      {q.isError ? <ErrorState message="Could not load report." onRetry={() => void q.refetch()} /> : null}
      {q.data && tab === 'sales' ? (
        <div className="panel">
          <div className="kpi-grid">
            <div className="kpi">
              <div className="label">Gross sales</div>
              <div className="value">
                <MoneyDisplay value={q.data.grossSales} />
              </div>
            </div>
            <div className="kpi">
              <div className="label">Returns</div>
              <div className="value">
                <MoneyDisplay value={q.data.returns} />
              </div>
            </div>
            <div className="kpi">
              <div className="label">Net sales</div>
              <div className="value">
                <MoneyDisplay value={q.data.netSales} />
              </div>
            </div>
            <div className="kpi">
              <div className="label">Invoices</div>
              <div className="value">{q.data.invoiceCount}</div>
            </div>
          </div>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                {q.data.invoices.map((i: any) => (
                  <tr key={i.id}>
                    <td>{i.invoiceNumber}</td>
                    <td>{i.customer}</td>
                    <td>
                      <StatusBadge status={i.status} />
                    </td>
                    <td className="text-end">
                      <MoneyDisplay value={i.grandTotal} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {q.data && tab === 'stock' ? (
        <div className="panel">
          <p>
            Valuation method: {q.data.costingMethod}. Total:{' '}
            <MoneyDisplay value={q.data.totalValuation} />
          </p>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>On hand</th>
                  <th className="text-end">Valuation</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((i: any) => (
                  <tr key={i.sku}>
                    <td>{i.sku}</td>
                    <td>{i.name}</td>
                    <td>
                      {i.quantityOnHand} {i.isLowStock ? <StatusBadge status="LOW" /> : null}
                    </td>
                    <td className="text-end">
                      <MoneyDisplay value={i.valuation} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {q.data && tab === 'receivables' ? (
        <div className="panel">
          <p>
            Total due: <MoneyDisplay value={q.data.totalDue} />
          </p>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th className="text-end">Due</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((i: any) => (
                  <tr key={i.invoiceNumber}>
                    <td>{i.invoiceNumber}</td>
                    <td>{i.customer}</td>
                    <td className="text-end">
                      <MoneyDisplay value={i.balanceDue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {q.data && tab === 'purchases' ? (
        <div className="panel">
          <p>
            Purchases: <MoneyDisplay value={q.data.totalPurchases} /> · Payables:{' '}
            <MoneyDisplay value={q.data.totalDue} />
          </p>
          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th className="text-end">Due</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((i: any) => (
                  <tr key={i.purchaseNumber}>
                    <td>{i.purchaseNumber}</td>
                    <td>{i.supplier}</td>
                    <td>
                      <StatusBadge status={i.status} />
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
      ) : null}
    </div>
  );
}
