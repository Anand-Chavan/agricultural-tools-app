import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { InrPipe } from '../shared/pipes';

@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [FormsModule, RouterLink, InrPipe],
  template: `
    <div class="d-flex justify-content-between mb-2">
      <div>
        <h1 class="page-title">Purchases</h1>
        <p class="page-sub mb-0">Drafts do not change stock. Receiving does, exactly once per quantity.</p>
      </div>
      @if (auth.can('purchases:write')) {
        <button type="button" class="btn btn-agri" (click)="openCreate()">New purchase</button>
      }
    </div>
    <div class="panel table-responsive">
      <table class="table">
        <thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th class="text-end">Total</th><th class="text-end">Due</th><th></th></tr></thead>
        <tbody>
          @for (p of purchases(); track p.id) {
            <tr>
              <td>{{ p.purchaseNumber }}</td>
              <td>{{ p.supplier?.name }}</td>
              <td><span class="status-chip">{{ p.status }}</span></td>
              <td class="text-end">{{ p.grandTotal | inr }}</td>
              <td class="text-end">{{ p.balanceDue | inr }}</td>
              <td class="text-end">
                @if (auth.can('purchases:receive') && p.status !== 'RECEIVED' && p.status !== 'CANCELLED') {
                  <button type="button" class="btn btn-sm btn-outline-secondary" (click)="receive(p.id)">Receive</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <p class="small">Manage suppliers on <a routerLink="/suppliers">Suppliers</a>.</p>

    @if (showCreate()) {
      <div class="modal d-block" style="background:rgba(0,0,0,.35)">
        <div class="modal-dialog">
          <form class="modal-content" (ngSubmit)="create()">
            <div class="modal-header"><h5 class="modal-title">New draft purchase</h5><button type="button" class="btn-close" (click)="showCreate.set(false)"></button></div>
            <div class="modal-body">
              @if (formError()) { <div class="alert alert-danger">{{ formError() }}</div> }
              <label class="form-label">Supplier</label>
              <select class="form-select mb-2" [(ngModel)]="form.supplierId" name="supplierId">
                @for (s of suppliers(); track s.id) { <option [value]="s.id">{{ s.name }}</option> }
              </select>
              <label class="form-label">Product</label>
              <select class="form-select mb-2" [(ngModel)]="form.productId" name="productId">
                @for (p of products(); track p.id) { <option [value]="p.id">{{ p.sku }} — {{ p.name }}</option> }
              </select>
              <label class="form-label">Qty</label>
              <input type="number" class="form-control mb-2" [(ngModel)]="form.qty" name="qty" />
              <label class="form-label">Unit cost</label>
              <input type="number" class="form-control" [(ngModel)]="form.unitCost" name="unitCost" />
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" (click)="showCreate.set(false)">Cancel</button>
              <button class="btn btn-agri">Save draft</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class PurchasesComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  readonly purchases = signal<any[]>([]);
  readonly suppliers = signal<any[]>([]);
  readonly products = signal<any[]>([]);
  readonly showCreate = signal(false);
  readonly formError = signal('');
  form = { supplierId: '', productId: '', qty: 10, unitCost: 0 };

  ngOnInit() {
    void this.load();
  }

  async load() {
    const [p, s, pr] = await Promise.all([
      firstValueFrom(this.api.get<{ items: any[] }>('/api/purchases')),
      firstValueFrom(this.api.get<{ items: any[] }>('/api/suppliers')),
      firstValueFrom(this.api.get<{ items: any[] }>('/api/products', { pageSize: 100 })),
    ]);
    this.purchases.set(p.items);
    this.suppliers.set(s.items);
    this.products.set(pr.items);
  }

  openCreate() {
    this.form = {
      supplierId: this.suppliers()[0]?.id || '',
      productId: this.products()[0]?.id || '',
      qty: 10,
      unitCost: this.products()[0]?.costPrice || 0,
    };
    this.showCreate.set(true);
  }

  async create() {
    this.formError.set('');
    try {
      await this.api.post('/api/purchases', {
        supplierId: this.form.supplierId,
        otherCharges: 0,
        items: [
          {
            productId: this.form.productId,
            quantityOrdered: this.form.qty,
            unitCost: this.form.unitCost,
            discount: 0,
            taxRateSnapshot: 18,
          },
        ],
      });
      this.showCreate.set(false);
      await this.load();
    } catch (e: any) {
      this.formError.set(e?.error?.error?.message || 'Create failed');
    }
  }

  async receive(id: string) {
    const detail = await firstValueFrom(this.api.get<any>(`/api/purchases/${id}`));
    await this.api.post(`/api/purchases/${id}/receive`, {
      items: detail.items.map((i: any) => ({
        purchaseItemId: i.id,
        quantityReceived: Number(i.quantityOrdered) - Number(i.quantityReceived),
      })),
    });
    await this.load();
  }
}

@Component({
  selector: 'app-suppliers',
  standalone: true,
  imports: [],
  template: `
    <h1 class="page-title">Suppliers</h1>
    <p class="page-sub">Supplier directory and payables context.</p>
    <div class="panel table-responsive">
      <table class="table">
        <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead>
        <tbody>
          @for (s of items(); track s.id) {
            <tr>
              <td>{{ s.name }}</td>
              <td>{{ s.contactName || '—' }}</td>
              <td>{{ s.phone || '—' }}</td>
              <td>{{ s.email || '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class SuppliersComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly items = signal<any[]>([]);
  ngOnInit() {
    void firstValueFrom(this.api.get<{ items: any[] }>('/api/suppliers')).then((d) => this.items.set(d.items));
  }
}
