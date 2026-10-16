import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { InrPipe, IstDatePipe } from '../shared/pipes';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [FormsModule, RouterLink, InrPipe],
  template: `
    <div class="d-flex justify-content-between mb-2">
      <div>
        <h1 class="page-title">Customers</h1>
        <p class="page-sub mb-0">Search by name/phone. Duplicate phone numbers show a warning.</p>
      </div>
      @if (auth.can('customers:write')) {
        <button type="button" class="btn btn-agri" (click)="showCreate.set(true)">New customer</button>
      }
    </div>
    <div class="panel">
      <label class="form-label">Search</label>
      <input class="form-control" [(ngModel)]="q" (ngModelChange)="load()" />
    </div>
    <div class="panel table-responsive">
      <table class="table">
        <thead><tr><th>Name</th><th>Phone</th><th class="text-end">Purchases</th><th class="text-end">Outstanding</th></tr></thead>
        <tbody>
          @for (c of items(); track c.id) {
            <tr>
              <td><a [routerLink]="['/customers', c.id]">{{ c.name }}</a></td>
              <td>{{ c.phone || '—' }}</td>
              <td class="text-end">{{ c.totalPurchases | inr }}</td>
              <td class="text-end">{{ c.outstandingBalance | inr }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    @if (showCreate()) {
      <div class="modal d-block" style="background:rgba(0,0,0,.35)">
        <div class="modal-dialog">
          <form class="modal-content" (ngSubmit)="create()">
            <div class="modal-header"><h5 class="modal-title">New customer</h5><button type="button" class="btn-close" (click)="showCreate.set(false)"></button></div>
            <div class="modal-body">
              <label class="form-label">Name</label>
              <input class="form-control mb-2" [(ngModel)]="form.name" name="name" required />
              <label class="form-label">Phone</label>
              <input class="form-control mb-2" [(ngModel)]="form.phone" name="phone" />
              <label class="form-label">Email</label>
              <input class="form-control mb-2" [(ngModel)]="form.email" name="email" />
              <label class="form-label">Billing address</label>
              <input class="form-control" [(ngModel)]="form.billingAddress" name="billingAddress" />
              @if (formError()) { <div class="text-danger mt-2">{{ formError() }}</div> }
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" (click)="showCreate.set(false)">Cancel</button>
              <button class="btn btn-agri">Save</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class CustomersComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  q = '';
  readonly items = signal<any[]>([]);
  readonly showCreate = signal(false);
  readonly formError = signal('');
  form = { name: '', phone: '', email: '', billingAddress: '' };

  ngOnInit() {
    void this.load();
  }

  async load() {
    const data = await firstValueFrom(this.api.get<{ items: any[] }>('/api/customers', { q: this.q }));
    this.items.set(data.items);
  }

  async create() {
    try {
      await this.api.post('/api/customers', this.form);
      this.showCreate.set(false);
      this.form = { name: '', phone: '', email: '', billingAddress: '' };
      await this.load();
    } catch (e: any) {
      this.formError.set(e?.error?.error?.message || 'Create failed');
    }
  }
}

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [RouterLink, InrPipe, IstDatePipe],
  template: `
    <a routerLink="/customers" class="small">← Customers</a>
    @if (c()) {
      <h1 class="page-title mt-2">{{ c().name }}</h1>
      <p class="page-sub">{{ c().phone || 'No phone' }} · Outstanding {{ c().outstandingBalance | inr }}</p>
      <div class="panel table-responsive">
        <table class="table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Status</th><th class="text-end">Total</th><th class="text-end">Due</th></tr></thead>
          <tbody>
            @for (i of c().invoices; track i.id) {
              <tr>
                <td><a [routerLink]="['/sales', i.id]">{{ i.invoiceNumber || 'Draft' }}</a></td>
                <td>{{ i.invoiceDate | istDate }}</td>
                <td><span class="status-chip">{{ i.status }}</span></td>
                <td class="text-end">{{ i.grandTotal | inr }}</td>
                <td class="text-end">{{ i.balanceDue | inr }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class CustomerDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly c = signal<any>(null);
  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    void firstValueFrom(this.api.get(`/api/customers/${id}`)).then((d) => this.c.set(d));
  }
}
