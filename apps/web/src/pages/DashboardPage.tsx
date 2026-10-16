import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, formatDateIST } from '../api/client';
import { ErrorState, LoadingState, MoneyDisplay, StatusBadge } from '../components/ui';

type Dashboard = {
  kpis: {
    todaySales: number;
    monthToDateSales: number;
    purchaseSpend: number;
    lowStockCount: number;
    outstandingCustomerBalances: number;
    estimatedGrossProfit: number | null;
    costingMethod: string;
  };
  salesTrend: { date: string; total: number }[];
  topProducts: { name: string; quantity: number; salesValue: number }[];
  recentInvoices: {
    id: string;
    invoiceNumber: string | null;
    customerName: string;
    status: string;
    grandTotal: number;
    invoiceDate: string;
  }[];
  lowStockItems: { sku: string; name: string; quantityOnHand: number; reorderLevel: number }[];
};

export function DashboardPage() {
  const q = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/api/dashboard'),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) {
    return <ErrorState message="Could not load dashboard." onRetry={() => void q.refetch()} />;
  }
  const { kpis } = q.data;

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Live figures from your database — not hard-coded demo metrics.</p>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Today&apos;s sales</div>
          <div className="value">
            <MoneyDisplay value={kpis.todaySales} />
          </div>
        </div>
        <div className="kpi">
          <div className="label">Month-to-date sales</div>
          <div className="value">
            <MoneyDisplay value={kpis.monthToDateSales} />
          </div>
        </div>
        <div className="kpi">
          <div className="label">Purchase spend (range)</div>
          <div className="value">
            <MoneyDisplay value={kpis.purchaseSpend} />
          </div>
        </div>
        <div className="kpi">
          <div className="label">Low-stock items</div>
          <div className="value">{kpis.lowStockCount}</div>
        </div>
        <div className="kpi">
          <div className="label">Outstanding balances</div>
          <div className="value">
            <MoneyDisplay value={kpis.outstandingCustomerBalances} />
          </div>
        </div>
        {kpis.estimatedGrossProfit != null ? (
          <div className="kpi">
            <div className="label">Est. gross profit</div>
            <div className="value">
              <MoneyDisplay value={kpis.estimatedGrossProfit} />
            </div>
            <div className="small text-muted mt-1">{kpis.costingMethod}</div>
          </div>
        ) : null}
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="panel">
            <h2 className="h5">Recent invoices</h2>
            <div className="table-responsive">
              <table className="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th className="text-end">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <Link to={`/sales/${inv.id}`}>{inv.invoiceNumber || 'Draft'}</Link>
                      </td>
                      <td>{inv.customerName}</td>
                      <td>{formatDateIST(inv.invoiceDate)}</td>
                      <td>
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="text-end">
                        <MoneyDisplay value={inv.grandTotal} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <h2 className="h5">Sales trend</h2>
            {q.data.salesTrend.length === 0 ? (
              <p className="text-muted mb-0">No issued sales in the selected range yet.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {q.data.salesTrend.map((row) => (
                  <li key={row.date} className="d-flex justify-content-between py-1 border-bottom">
                    <span>{formatDateIST(row.date)}</span>
                    <MoneyDisplay value={row.total} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="col-lg-5">
          <div className="panel">
            <h2 className="h5">Top products</h2>
            {q.data.topProducts.length === 0 ? (
              <p className="text-muted mb-0">No product sales in range.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {q.data.topProducts.map((p) => (
                  <li key={p.name} className="d-flex justify-content-between py-1 border-bottom">
                    <span>
                      {p.name}
                      <span className="text-muted small d-block">{p.quantity} units</span>
                    </span>
                    <MoneyDisplay value={p.salesValue} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h2 className="h5 mb-0">Low stock</h2>
              <Link to="/inventory?lowStock=true">View all</Link>
            </div>
            {q.data.lowStockItems.length === 0 ? (
              <p className="text-muted mb-0">No low-stock items.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {q.data.lowStockItems.slice(0, 8).map((i) => (
                  <li key={i.sku} className="d-flex justify-content-between py-1 border-bottom">
                    <span>
                      {i.name}
                      <span className="text-muted small d-block">{i.sku}</span>
                    </span>
                    <span className="status-chip warn">
                      {i.quantityOnHand} / {i.reorderLevel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
