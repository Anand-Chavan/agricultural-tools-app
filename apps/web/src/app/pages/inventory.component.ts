import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { IstDatePipe } from '../shared/pipes';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [FormsModule, IstDatePipe],
  template: `
    <h1 class="page-title">Inventory</h1>
    <p class="page-sub">On-hand balances and immutable stock movement ledger.</p>

    <div class="panel d-flex flex-wrap gap-3 align-items-end">
      <div class="flex-grow-1">
        <label class="form-label">Search</label>
        <input class="form-control" [(ngModel)]="q" (ngModelChange)="loadBalances()" />
      </div>
      <div class="form-check mb-2">
        <input class="form-check-input" type="checkbox" id="low" [(ngModel)]="lowOnly" (ngModelChange)="loadBalances()" />
        <label class="form-check-label" for="low">Low stock only</label>
      </div>
    </div>

    <div class="panel table-responsive">
      <table class="table align-middle">
        <thead><tr><th>SKU</th><th>Product</th><th>On hand</th><th>Reorder</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (i of balances(); track i.id) {
            <tr>
              <td>{{ i.sku }}</td>
              <td>{{ i.name }}</td>
              <td>{{ i.quantityOnHand }}</td>
              <td>{{ i.reorderLevel }}</td>
              <td><span class="status-chip" [class.warn]="i.isLowStock">{{ i.isLowStock ? 'LOW' : 'OK' }}</span></td>
              <td class="text-end">
                @if (auth.can('inventory:adjust')) {
                  <button type="button" class="btn btn-sm btn-outline-secondary" (click)="openAdjust(i)">Adjust</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h2 class="h5">Recent movements</h2>
      <table class="table table-sm">
        <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Reason</th><th>User</th></tr></thead>
        <tbody>
          @for (m of movements(); track m.id) {
            <tr>
              <td>{{ m.createdAt | istDate }}</td>
              <td>{{ m.product.sku }} — {{ m.product.name }}</td>
              <td>{{ m.movementType }}</td>
              <td>{{ m.quantityDelta }}</td>
              <td>{{ m.reason || '—' }}</td>
              <td>{{ m.createdBy?.name || '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    @if (adjustItem()) {
      <div class="modal d-block" style="background:rgba(0,0,0,.35)">
        <div class="modal-dialog">
          <form class="modal-content" (ngSubmit)="submitAdjust()">
            <div class="modal-header">
              <h5 class="modal-title">Adjust stock</h5>
              <button type="button" class="btn-close" (click)="adjustItem.set(null)"></button>
            </div>
            <div class="modal-body">
              <p>Adjusting <strong>{{ adjustItem()?.name }}</strong>. Posts a ledger movement (no direct on-hand edit).</p>
              <label class="form-label">Quantity delta (+/-)</label>
              <input class="form-control mb-2" [(ngModel)]="delta" name="delta" />
              <label class="form-label">Reason</label>
              <textarea class="form-control" [(ngModel)]="reason" name="reason"></textarea>
              @if (adjustError()) { <div class="text-danger mt-2">{{ adjustError() }}</div> }
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" (click)="adjustItem.set(null)">Cancel</button>
              <button class="btn btn-agri">Post adjustment</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class InventoryComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  q = '';
  lowOnly = false;
  delta = '1';
  reason = '';
  readonly balances = signal<any[]>([]);
  readonly movements = signal<any[]>([]);
  readonly adjustItem = signal<any>(null);
  readonly adjustError = signal('');

  ngOnInit() {
    void this.loadBalances();
    void this.loadMovements();
  }

  async loadBalances() {
    const data = await firstValueFrom(
      this.api.get<{ items: any[] }>('/api/inventory/balances', { q: this.q, lowStock: this.lowOnly }),
    );
    this.balances.set(data.items);
  }

  async loadMovements() {
    const data = await firstValueFrom(this.api.get<{ items: any[] }>('/api/inventory/movements', { pageSize: 30 }));
    this.movements.set(data.items);
  }

  openAdjust(item: any) {
    this.adjustItem.set(item);
    this.delta = '1';
    this.reason = '';
    this.adjustError.set('');
  }

  async submitAdjust() {
    try {
      await this.api.post('/api/inventory/adjustments', {
        productId: this.adjustItem().productId,
        quantityDelta: Number(this.delta),
        reason: this.reason,
        movementType: 'MANUAL_ADJUSTMENT',
      });
      this.adjustItem.set(null);
      await Promise.all([this.loadBalances(), this.loadMovements()]);
    } catch (e: any) {
      this.adjustError.set(e?.error?.error?.message || 'Adjustment failed');
    }
  }
}
