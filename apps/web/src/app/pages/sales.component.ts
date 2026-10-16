import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { InrPipe, IstDatePipe } from '../shared/pipes';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [RouterLink, InrPipe, IstDatePipe],
  template: `
    <div class="d-flex justify-content-between mb-2">
      <div>
        <h1 class="page-title">Sales & Billing</h1>
        <p class="page-sub mb-0">Create drafts, issue invoices, record partial payments, print A4 invoices.</p>
      </div>
      @if (auth.can('sales:write')) {
        <a class="btn btn-agri" routerLink="/sales/new">New invoice</a>
      }
    </div>
    <div class="panel table-responsive">
      <table class="table">
        <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Status</th><th class="text-end">Total</th><th class="text-end">Due</th></tr></thead>
        <tbody>
          @for (i of items(); track i.id) {
            <tr>
              <td><a [routerLink]="['/sales', i.id]">{{ i.invoiceNumber || 'Draft' }}</a></td>
              <td>{{ i.customer?.name || i.walkInName || '—' }}</td>
              <td>{{ i.invoiceDate | istDate }}</td>
              <td><span class="status-chip">{{ i.status }}</span></td>
              <td class="text-end">{{ i.grandTotal | inr }}</td>
              <td class="text-end">{{ i.balanceDue | inr }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class SalesComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  readonly items = signal<any[]>([]);
  ngOnInit() {
    void firstValueFrom(this.api.get<{ items: any[] }>('/api/invoices')).then((d) => this.items.set(d.items));
  }
}

@Component({
  selector: 'app-new-invoice',
  standalone: true,
  imports: [FormsModule, RouterLink, InrPipe],
  template: `
    <a routerLink="/sales" class="small">← Back</a>
    <h1 class="page-title mt-2">New invoice</h1>
    <p class="page-sub">Totals are recalculated on the server when you save and issue.</p>
    <div class="panel">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Customer</label>
          <select class="form-select" [(ngModel)]="customerId" name="customerId">
            <option value="">Walk-in customer</option>
            @for (c of customers(); track c.id) {
              <option [value]="c.id">{{ c.name }} {{ c.phone ? '(' + c.phone + ')' : '' }}</option>
            }
          </select>
        </div>
        @if (!customerId) {
          <div class="col-md-6">
            <label class="form-label">Walk-in name</label>
            <input class="form-control" [(ngModel)]="walkInName" name="walkInName" />
          </div>
        }
        <div class="col-md-6">
          <label class="form-label">Product</label>
          <select class="form-select" [(ngModel)]="productId" name="productId">
            @for (p of products(); track p.id) {
              <option [value]="p.id">{{ p.sku }} — {{ p.name }} (stock {{ p.quantityOnHand }})</option>
            }
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label">Quantity</label>
          <input type="number" class="form-control" [(ngModel)]="qty" name="qty" min="1" />
        </div>
      </div>
      <button type="button" class="btn btn-agri mt-3" [disabled]="busy()" (click)="preview()">
        {{ busy() ? 'Saving…' : 'Preview draft' }}
      </button>
      @if (error()) { <div class="text-danger mt-2">{{ error() }}</div> }
    </div>

    @if (draft()) {
      <div class="panel">
        <h2 class="h5">Preview before issue</h2>
        <p>Draft total {{ draft().grandTotal | inr }} (tax {{ draft().taxTotal | inr }})</p>
        <div class="row g-3 align-items-end">
          <div class="col-md-4">
            <label class="form-label">Amount paid now</label>
            <input type="number" class="form-control" [(ngModel)]="payAmount" name="payAmount" />
          </div>
          <div class="col-md-4">
            <label class="form-label">Payment method</label>
            <select class="form-select" [(ngModel)]="payMethod" name="payMethod">
              @for (m of methods; track m) { <option [value]="m">{{ m }}</option> }
            </select>
          </div>
          <div class="col-md-4">
            <button type="button" class="btn btn-agri" [disabled]="issuing() || !auth.can('sales:issue')" (click)="issue()">
              {{ issuing() ? 'Issuing…' : 'Issue invoice' }}
            </button>
          </div>
        </div>
        @if (issueError()) { <div class="alert alert-danger mt-3 mb-0">{{ issueError() }}</div> }
      </div>
    }
  `,
})
export class NewInvoiceComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly customers = signal<any[]>([]);
  readonly products = signal<any[]>([]);
  readonly draft = signal<any>(null);
  readonly busy = signal(false);
  readonly issuing = signal(false);
  readonly error = signal('');
  readonly issueError = signal('');
  customerId = '';
  walkInName = '';
  productId = '';
  qty = 1;
  payAmount = 0;
  payMethod = 'CASH';
  methods = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT'];

  ngOnInit() {
    void Promise.all([
      firstValueFrom(this.api.get<{ items: any[] }>('/api/customers')),
      firstValueFrom(this.api.get<{ items: any[] }>('/api/products', { pageSize: 100 })),
    ]).then(([c, p]) => {
      this.customers.set(c.items);
      this.products.set(p.items);
      this.productId = p.items[0]?.id || '';
    });
  }

  async preview() {
    this.busy.set(true);
    this.error.set('');
    try {
      const d = await this.api.post('/api/invoices', {
        customerId: this.customerId || null,
        walkInName: this.customerId ? null : this.walkInName || 'Walk-in',
        items: [{ productId: this.productId, quantity: this.qty }],
      });
      this.draft.set(d);
    } catch (e: any) {
      this.error.set(e?.error?.error?.message || 'Could not create draft');
    } finally {
      this.busy.set(false);
    }
  }

  async issue() {
    this.issuing.set(true);
    this.issueError.set('');
    try {
      const inv: any = await this.api.post(`/api/invoices/${this.draft().id}/issue`, {
        amount: this.payAmount,
        method: this.payMethod,
      });
      await this.router.navigate(['/sales', inv.id]);
    } catch (e: any) {
      this.issueError.set(e?.error?.error?.message || 'Issue failed');
    } finally {
      this.issuing.set(false);
    }
  }
}

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, InrPipe, IstDatePipe],
  template: `
    @if (inv()) {
      <div class="d-flex justify-content-between align-items-start no-print mb-2">
        <div>
          <a routerLink="/sales" class="small">← Invoices</a>
          <h1 class="page-title mt-2">{{ inv().invoiceNumber || 'Draft invoice' }}</h1>
          <p class="page-sub mb-0"><span class="status-chip">{{ inv().status }}</span> · {{ inv().invoiceDate | istDate }}</p>
        </div>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-outline-secondary" (click)="print()">Print</button>
          @if (auth.can('sales:pay') && inv().balanceDue > 0 && inv().status !== 'VOIDED') {
            <button type="button" class="btn btn-agri" (click)="showPay.set(true)">Record payment</button>
          }
          @if (auth.can('sales:void') && inv().status !== 'DRAFT' && inv().status !== 'VOIDED') {
            <button type="button" class="btn btn-outline-danger" (click)="showVoid.set(true)">Void</button>
          }
        </div>
      </div>

      <div class="panel invoice-print">
        <div class="d-flex justify-content-between mb-3">
          <div>
            <h2 class="h4 mb-1">{{ settings()?.businessName || 'Agricultural Tools Co. (Demo)' }}</h2>
            <div class="small text-muted" style="white-space:pre-line">{{ settings()?.address }}
{{ settings()?.phone }} · {{ settings()?.email }}
GSTIN: {{ settings()?.gstin }}</div>
          </div>
          <div class="text-end">
            <div class="fw-semibold">Tax Invoice</div>
            <div>{{ inv().invoiceNumber || 'DRAFT' }}</div>
            <div>{{ inv().invoiceDate | istDate }}</div>
          </div>
        </div>
        <div class="mb-3">
          <div class="text-muted small">Bill to</div>
          <div class="fw-semibold">{{ inv().customer?.name || inv().walkInName || 'Walk-in' }}</div>
        </div>
        <table class="table table-sm">
          <thead><tr><th>Item</th><th>SKU</th><th class="text-end">Qty</th><th class="text-end">Price</th><th class="text-end">Tax</th><th class="text-end">Line total</th></tr></thead>
          <tbody>
            @for (item of inv().items; track item.id) {
              <tr>
                <td>{{ item.productNameSnapshot }}</td>
                <td>{{ item.skuSnapshot }}</td>
                <td class="text-end">{{ item.quantity }}</td>
                <td class="text-end">{{ item.unitPrice | inr }}</td>
                <td class="text-end">{{ item.taxAmount | inr }}</td>
                <td class="text-end">{{ item.lineTotal | inr }}</td>
              </tr>
            }
          </tbody>
        </table>
        <div class="d-flex justify-content-end">
          <div style="min-width:260px">
            <div class="d-flex justify-content-between"><span>Subtotal</span><span>{{ inv().subtotal | inr }}</span></div>
            <div class="d-flex justify-content-between"><span>Tax</span><span>{{ inv().taxTotal | inr }}</span></div>
            <div class="d-flex justify-content-between fw-bold border-top pt-2 mt-2"><span>Grand total</span><span>{{ inv().grandTotal | inr }}</span></div>
            <div class="d-flex justify-content-between"><span>Amount paid</span><span>{{ inv().amountPaid | inr }}</span></div>
            <div class="d-flex justify-content-between"><span>Balance due</span><span>{{ inv().balanceDue | inr }}</span></div>
          </div>
        </div>
        <p class="small text-muted mt-3 mb-0">{{ settings()?.invoiceTerms }}</p>
        <p class="small text-muted">{{ settings()?.taxWarning }}</p>
      </div>

      <div class="panel no-print">
        <h2 class="h5">Payments</h2>
        @for (p of inv().payments || []; track p.id) {
          <div>{{ p.paidAt | istDate }} — {{ p.amount | inr }} via {{ p.method }}</div>
        } @empty {
          <p class="text-muted mb-0">No payments recorded.</p>
        }
      </div>
    }

    @if (showPay()) {
      <div class="modal d-block no-print" style="background:rgba(0,0,0,.35)">
        <div class="modal-dialog">
          <form class="modal-content" (ngSubmit)="pay()">
            <div class="modal-header"><h5 class="modal-title">Record payment</h5><button type="button" class="btn-close" (click)="showPay.set(false)"></button></div>
            <div class="modal-body">
              <label class="form-label">Amount</label>
              <input type="number" class="form-control mb-2" [(ngModel)]="payAmount" name="payAmount" />
              <label class="form-label">Method</label>
              <select class="form-select" [(ngModel)]="payMethod" name="payMethod">
                @for (m of ['CASH','UPI','CARD','BANK_TRANSFER','CREDIT']; track m) { <option [value]="m">{{ m }}</option> }
              </select>
              @if (payError()) { <div class="text-danger mt-2">{{ payError() }}</div> }
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" (click)="showPay.set(false)">Cancel</button>
              <button class="btn btn-agri">Save payment</button>
            </div>
          </form>
        </div>
      </div>
    }

    @if (showVoid()) {
      <div class="modal d-block no-print" style="background:rgba(0,0,0,.35)">
        <div class="modal-dialog">
          <form class="modal-content" (ngSubmit)="voidInvoice()">
            <div class="modal-header"><h5 class="modal-title">Void invoice</h5><button type="button" class="btn-close" (click)="showVoid.set(false)"></button></div>
            <div class="modal-body">
              <p>Voiding restocks sold quantities and clears balances.</p>
              <label class="form-label">Reason</label>
              <textarea class="form-control" [(ngModel)]="voidReason" name="voidReason"></textarea>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" (click)="showVoid.set(false)">Cancel</button>
              <button class="btn btn-danger">Void invoice</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class InvoiceDetailComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly inv = signal<any>(null);
  readonly settings = signal<any>(null);
  readonly showPay = signal(false);
  readonly showVoid = signal(false);
  readonly payError = signal('');
  payAmount = 0;
  payMethod = 'UPI';
  voidReason = '';

  ngOnInit() {
    void this.load();
  }

  async load() {
    const id = this.route.snapshot.paramMap.get('id')!;
    const [inv, settings] = await Promise.all([
      firstValueFrom(this.api.get(`/api/invoices/${id}`)),
      firstValueFrom(this.api.get<any>('/api/settings')),
    ]);
    this.inv.set(inv);
    this.settings.set(settings.settings);
  }

  print() {
    window.print();
  }

  async pay() {
    this.payError.set('');
    try {
      const id = this.route.snapshot.paramMap.get('id')!;
      await this.api.post(`/api/invoices/${id}/payments`, { amount: this.payAmount, method: this.payMethod });
      this.showPay.set(false);
      await this.load();
    } catch (e: any) {
      this.payError.set(e?.error?.error?.message || 'Payment failed');
    }
  }

  async voidInvoice() {
    const id = this.route.snapshot.paramMap.get('id')!;
    await this.api.post(`/api/invoices/${id}/void`, { reason: this.voidReason });
    this.showVoid.set(false);
    await this.load();
  }
}
