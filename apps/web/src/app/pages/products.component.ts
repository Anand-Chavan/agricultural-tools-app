import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { InrPipe, IstDatePipe, UploadSrcPipe } from '../shared/pipes';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [RouterLink, FormsModule, InrPipe, UploadSrcPipe],
  template: `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
      <div>
        <h1 class="page-title">Products & Catalogue</h1>
        <p class="page-sub mb-0">Sample SKUs and prices are examples only. Photos are from the supplied reference PDF.</p>
      </div>
      @if (auth.can('products:write')) {
        <button type="button" class="btn btn-sm btn-agri" (click)="showCreate.set(true)">New product</button>
      }
    </div>

    <div class="panel">
      <label class="form-label" for="q">Search</label>
      <input id="q" class="form-control" [(ngModel)]="q" (ngModelChange)="load()" placeholder="Name, SKU, or barcode" />
    </div>

    @if (loading()) { <div class="loading-state">Loading…</div> }
    @if (error()) { <div class="error-state">{{ error() }}</div> }

    <div class="product-card-grid">
      @for (p of items(); track p.id) {
        <a class="product-card" [routerLink]="['/products', p.id]">
          @if (p.images?.[0]?.storageKey; as key) {
            <img class="product-thumb" [src]="key | uploadSrc" [alt]="p.name" />
          } @else {
            <div class="product-thumb placeholder">No image</div>
          }
          <div class="p-3">
            <div class="small text-muted">{{ p.sku }}</div>
            <div class="fw-semibold">{{ p.name }}</div>
            <div class="small text-muted">{{ p.category?.name }}</div>
            <div class="d-flex justify-content-between align-items-center mt-2">
              <span>{{ p.sellingPrice | inr }}</span>
              <span class="status-chip" [class.warn]="p.isLowStock">{{ p.isLowStock ? 'LOW' : 'OK' }}</span>
            </div>
            <div class="small mt-1">On hand: {{ p.quantityOnHand }}</div>
          </div>
        </a>
      }
    </div>

    @if (showCreate()) {
      <div class="modal d-block" style="background:rgba(0,0,0,.35)">
        <div class="modal-dialog modal-lg">
          <form class="modal-content" (ngSubmit)="create()">
            <div class="modal-header">
              <h5 class="modal-title">New product</h5>
              <button type="button" class="btn-close" (click)="showCreate.set(false)"></button>
            </div>
            <div class="modal-body">
              @if (createError()) { <div class="alert alert-danger">{{ createError() }}</div> }
              <div class="row g-3">
                <div class="col-md-6"><label class="form-label">SKU</label><input class="form-control" [(ngModel)]="form.sku" name="sku" required /></div>
                <div class="col-md-6"><label class="form-label">Name</label><input class="form-control" [(ngModel)]="form.name" name="name" required /></div>
                <div class="col-md-6">
                  <label class="form-label">Category</label>
                  <select class="form-select" [(ngModel)]="form.categoryId" name="categoryId">
                    @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Type</label>
                  <select class="form-select" [(ngModel)]="form.productType" name="productType">
                    <option value="MANUFACTURED">Manufactured</option>
                    <option value="RESOLD">Resold</option>
                  </select>
                </div>
                <div class="col-md-4"><label class="form-label">Selling price</label><input type="number" class="form-control" [(ngModel)]="form.sellingPrice" name="sellingPrice" /></div>
                @if (auth.can('products:cost')) {
                  <div class="col-md-4"><label class="form-label">Cost price</label><input type="number" class="form-control" [(ngModel)]="form.costPrice" name="costPrice" /></div>
                }
                <div class="col-md-4"><label class="form-label">Reorder level</label><input type="number" class="form-control" [(ngModel)]="form.reorderLevel" name="reorderLevel" /></div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" (click)="showCreate.set(false)">Cancel</button>
              <button class="btn btn-agri" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Create' }}</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class ProductsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  q = '';
  readonly items = signal<any[]>([]);
  readonly categories = signal<any[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly showCreate = signal(false);
  readonly saving = signal(false);
  readonly createError = signal('');
  form: any = {
    sku: '',
    name: '',
    categoryId: '',
    productType: 'MANUFACTURED',
    unit: 'pcs',
    costPrice: 0,
    sellingPrice: 0,
    reorderLevel: 10,
    description: 'DEMO SAMPLE — replace with confirmed product data.',
  };

  ngOnInit() {
    void this.loadCategories();
    void this.load();
  }

  async loadCategories() {
    const data = await firstValueFrom(this.api.get<{ items: any[] }>('/api/categories'));
    this.categories.set(data.items);
    if (!this.form.categoryId && data.items[0]) this.form.categoryId = data.items[0].id;
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(this.api.get<{ items: any[] }>('/api/products', { q: this.q, pageSize: 50 }));
      this.items.set(data.items);
    } catch {
      this.error.set('Could not load products.');
    } finally {
      this.loading.set(false);
    }
  }

  async create() {
    this.saving.set(true);
    this.createError.set('');
    try {
      await this.api.post('/api/products', this.form);
      this.showCreate.set(false);
      await this.load();
    } catch (e: any) {
      this.createError.set(e?.error?.error?.message || e?.message || 'Create failed');
    } finally {
      this.saving.set(false);
    }
  }
}

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, InrPipe, IstDatePipe, UploadSrcPipe],
  template: `
    <a routerLink="/products" class="small no-print">← Back to products</a>
    @if (loading()) {
      <div class="loading-state">Loading…</div>
    } @else if (p()) {
      <h1 class="page-title mt-2">{{ p().name }}</h1>
      <p class="page-sub">{{ p().sku }} · {{ p().category?.name }}</p>
      <div class="row g-3">
        <div class="col-lg-4">
          <div class="panel">
            @if (p().images?.[0]?.storageKey) {
              <img class="product-thumb" [src]="p().images[0].storageKey | uploadSrc" [alt]="p().name" />
            } @else {
              <div class="product-thumb placeholder">No image</div>
            }
            @if (auth.can('products:write')) {
              <div class="mt-3">
                <label class="form-label">Upload photo</label>
                <input type="file" class="form-control" accept="image/jpeg,image/png,image/webp" (change)="onFile($event)" />
                <button type="button" class="btn btn-sm btn-agri mt-2" [disabled]="!file || uploading()" (click)="upload()">
                  {{ uploading() ? 'Uploading…' : 'Upload image' }}
                </button>
              </div>
            }
          </div>
        </div>
        <div class="col-lg-8">
          <div class="panel">
            <div class="row g-3">
              <div class="col-md-4"><div class="text-muted small">Selling price</div><div class="fs-5">{{ p().sellingPrice | inr }}</div></div>
              @if (p().costPrice != null) {
                <div class="col-md-4"><div class="text-muted small">Cost price</div><div class="fs-5">{{ p().costPrice | inr }}</div></div>
              }
              <div class="col-md-4"><div class="text-muted small">On hand</div><div class="fs-5">{{ p().quantityOnHand }}</div></div>
              <div class="col-12"><div class="text-muted small">Description</div><div>{{ p().description || '—' }}</div></div>
            </div>
          </div>
          <div class="panel">
            <h2 class="h5">Stock movements</h2>
            <table class="table table-sm">
              <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Reason</th><th>User</th></tr></thead>
              <tbody>
                @for (m of p().movements || []; track m.id) {
                  <tr>
                    <td>{{ m.createdAt | istDate }}</td>
                    <td>{{ m.movementType }}</td>
                    <td>{{ m.quantityDelta }}</td>
                    <td>{{ m.reason || '—' }}</td>
                    <td>{{ m.createdBy?.name || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProductDetailComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly p = signal<any>(null);
  readonly loading = signal(true);
  readonly uploading = signal(false);
  file: File | null = null;

  ngOnInit() {
    void this.load();
  }

  async load() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loading.set(true);
    try {
      this.p.set(await firstValueFrom(this.api.get(`/api/products/${id}`)));
    } finally {
      this.loading.set(false);
    }
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    this.file = input.files?.[0] || null;
  }

  async upload() {
    if (!this.file) return;
    this.uploading.set(true);
    try {
      const id = this.route.snapshot.paramMap.get('id')!;
      const fd = new FormData();
      fd.append('image', this.file);
      await this.api.upload(`/api/products/${id}/images`, fd);
      this.file = null;
      await this.load();
    } finally {
      this.uploading.set(false);
    }
  }
}
