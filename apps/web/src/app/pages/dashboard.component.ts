import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { InrPipe, IstDatePipe } from '../shared/pipes';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, InrPipe, IstDatePipe],
  template: `
    <h1 class="page-title">Dashboard</h1>
    <p class="page-sub">Live figures from your database — not hard-coded demo metrics.</p>

    @if (loading()) {
      <div class="loading-state">Loading…</div>
    } @else if (error()) {
      <div class="error-state">{{ error() }} <button class="btn btn-sm btn-outline-secondary" (click)="load()">Retry</button></div>
    } @else if (data()) {
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Today's sales</div><div class="value">{{ data().kpis.todaySales | inr }}</div></div>
        <div class="kpi"><div class="label">Month-to-date sales</div><div class="value">{{ data().kpis.monthToDateSales | inr }}</div></div>
        <div class="kpi"><div class="label">Purchase spend</div><div class="value">{{ data().kpis.purchaseSpend | inr }}</div></div>
        <div class="kpi"><div class="label">Low-stock items</div><div class="value">{{ data().kpis.lowStockCount }}</div></div>
        <div class="kpi"><div class="label">Outstanding balances</div><div class="value">{{ data().kpis.outstandingCustomerBalances | inr }}</div></div>
        @if (data().kpis.estimatedGrossProfit != null) {
          <div class="kpi">
            <div class="label">Est. gross profit</div>
            <div class="value">{{ data().kpis.estimatedGrossProfit | inr }}</div>
            <div class="small text-muted mt-1">{{ data().kpis.costingMethod }}</div>
          </div>
        }
      </div>

      <div class="row g-3">
        <div class="col-lg-7">
          <div class="panel">
            <h2 class="h5">Recent invoices</h2>
            <div class="table-responsive">
              <table class="table table-sm align-middle">
                <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Status</th><th class="text-end">Total</th></tr></thead>
                <tbody>
                  @for (inv of data().recentInvoices; track inv.id) {
                    <tr>
                      <td><a [routerLink]="['/sales', inv.id]">{{ inv.invoiceNumber || 'Draft' }}</a></td>
                      <td>{{ inv.customerName }}</td>
                      <td>{{ inv.invoiceDate | istDate }}</td>
                      <td><span class="status-chip">{{ inv.status }}</span></td>
                      <td class="text-end">{{ inv.grandTotal | inr }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="panel">
            <div class="d-flex justify-content-between mb-2">
              <h2 class="h5 mb-0">Low stock</h2>
              <a routerLink="/inventory">View all</a>
            </div>
            @if (!data().lowStockItems.length) {
              <p class="text-muted mb-0">No low-stock items.</p>
            } @else {
              <ul class="list-unstyled mb-0">
                @for (i of data().lowStockItems.slice(0, 8); track i.sku) {
                  <li class="d-flex justify-content-between py-1 border-bottom">
                    <span>{{ i.name }}<span class="text-muted small d-block">{{ i.sku }}</span></span>
                    <span class="status-chip warn">{{ i.quantityOnHand }} / {{ i.reorderLevel }}</span>
                  </li>
                }
              </ul>
            }
          </div>
          <div class="panel">
            <h2 class="h5">Top products</h2>
            @for (p of data().topProducts; track p.name) {
              <div class="d-flex justify-content-between py-1 border-bottom">
                <span>{{ p.name }}<span class="text-muted small d-block">{{ p.quantity }} units</span></span>
                <span>{{ p.salesValue | inr }}</span>
              </div>
            } @empty {
              <p class="text-muted mb-0">No product sales in range.</p>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly data = signal<any>(null);

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.data.set(await firstValueFrom(this.api.get('/api/dashboard')));
    } catch {
      this.error.set('Could not load dashboard.');
    } finally {
      this.loading.set(false);
    }
  }
}
