import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { InrPipe } from '../shared/pipes';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [InrPipe],
  template: `
    <h1 class="page-title">Reports</h1>
    <p class="page-sub">Server-side reports with CSV export. Gross profit is only shown where cost basis exists.</p>
    <div class="d-flex flex-wrap gap-2 mb-3 no-print">
      @for (t of tabs; track t) {
        <button type="button" class="btn btn-sm" [class.btn-agri]="tab() === t" [class.btn-outline-secondary]="tab() !== t" (click)="setTab(t)">{{ t }}</button>
      }
      <a class="btn btn-sm btn-outline-secondary" [href]="'/api/reports/' + tab() + '?format=csv'">Export CSV</a>
    </div>

    @if (loading()) {
      <div class="loading-state">Loading…</div>
    } @else if (data()) {
      @if (tab() === 'sales') {
        <div class="panel">
          <div class="kpi-grid">
            <div class="kpi"><div class="label">Gross sales</div><div class="value">{{ data().grossSales | inr }}</div></div>
            <div class="kpi"><div class="label">Returns</div><div class="value">{{ data().returns | inr }}</div></div>
            <div class="kpi"><div class="label">Net sales</div><div class="value">{{ data().netSales | inr }}</div></div>
            <div class="kpi"><div class="label">Invoices</div><div class="value">{{ data().invoiceCount }}</div></div>
          </div>
        </div>
      }
      @if (tab() === 'stock') {
        <div class="panel">
          <p>Valuation method: {{ data().costingMethod }}. Total: {{ data().totalValuation | inr }}</p>
          <table class="table table-sm">
            <thead><tr><th>SKU</th><th>Name</th><th>On hand</th><th class="text-end">Valuation</th></tr></thead>
            <tbody>
              @for (i of data().items; track i.sku) {
                <tr>
                  <td>{{ i.sku }}</td><td>{{ i.name }}</td>
                  <td>{{ i.quantityOnHand }} @if (i.isLowStock) { <span class="status-chip warn">LOW</span> }</td>
                  <td class="text-end">{{ i.valuation | inr }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (tab() === 'receivables') {
        <div class="panel">
          <p>Total due: {{ data().totalDue | inr }}</p>
          <table class="table table-sm">
            <thead><tr><th>Invoice</th><th>Customer</th><th class="text-end">Due</th></tr></thead>
            <tbody>
              @for (i of data().items; track i.invoiceNumber) {
                <tr><td>{{ i.invoiceNumber }}</td><td>{{ i.customer }}</td><td class="text-end">{{ i.balanceDue | inr }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (tab() === 'purchases') {
        <div class="panel">
          <p>Purchases: {{ data().totalPurchases | inr }} · Payables: {{ data().totalDue | inr }}</p>
          <table class="table table-sm">
            <thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th class="text-end">Due</th></tr></thead>
            <tbody>
              @for (i of data().items; track i.purchaseNumber) {
                <tr><td>{{ i.purchaseNumber }}</td><td>{{ i.supplier }}</td><td>{{ i.status }}</td><td class="text-end">{{ i.balanceDue | inr }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
})
export class ReportsComponent implements OnInit {
  private readonly api = inject(ApiService);
  tabs = ['sales', 'stock', 'receivables', 'purchases'] as const;
  readonly tab = signal<(typeof this.tabs)[number]>('sales');
  readonly data = signal<any>(null);
  readonly loading = signal(true);

  ngOnInit() {
    void this.load();
  }

  setTab(t: (typeof this.tabs)[number]) {
    this.tab.set(t);
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.data.set(await firstValueFrom(this.api.get(`/api/reports/${this.tab()}`)));
    } finally {
      this.loading.set(false);
    }
  }
}
