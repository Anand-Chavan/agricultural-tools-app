import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { IstDatePipe } from '../shared/pipes';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule, IstDatePipe],
  template: `
    <h1 class="page-title">Users & Roles</h1>
    <p class="page-sub">Admin-managed staff accounts. No public self-registration.</p>
    <div class="panel">
      <h2 class="h5">Create user</h2>
      <div class="row g-2">
        <div class="col-md-3"><input class="form-control" placeholder="Name" [(ngModel)]="form.name" name="name" /></div>
        <div class="col-md-3"><input class="form-control" placeholder="Email" [(ngModel)]="form.email" name="email" /></div>
        <div class="col-md-2"><input class="form-control" placeholder="Temp password" [(ngModel)]="form.password" name="password" /></div>
        <div class="col-md-2">
          <select class="form-select" [(ngModel)]="form.roleId" name="roleId">
            @for (r of roles(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
          </select>
        </div>
        <div class="col-md-2"><button type="button" class="btn btn-agri w-100" (click)="create()">Add</button></div>
      </div>
    </div>
    <div class="panel table-responsive">
      <table class="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead>
        <tbody>
          @for (u of users(); track u.id) {
            <tr>
              <td>{{ u.name }}</td><td>{{ u.email }}</td><td>{{ u.role }}</td>
              <td><span class="status-chip">{{ u.isActive ? 'ACTIVE' : 'DISABLED' }}</span></td>
              <td>{{ u.lastLoginAt | istDate }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class UsersComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly users = signal<any[]>([]);
  readonly roles = signal<any[]>([]);
  form = { name: '', email: '', password: 'ChangeMe123!', roleId: '' };

  ngOnInit() {
    void this.load();
  }

  async load() {
    const [u, r] = await Promise.all([
      firstValueFrom(this.api.get<{ items: any[] }>('/api/users')),
      firstValueFrom(this.api.get<{ items: any[] }>('/api/roles')),
    ]);
    this.users.set(u.items);
    this.roles.set(r.items);
    if (!this.form.roleId) this.form.roleId = r.items[0]?.id || '';
  }

  async create() {
    await this.api.post('/api/users', this.form);
    this.form = { name: '', email: '', password: 'ChangeMe123!', roleId: this.roles()[0]?.id || '' };
    await this.load();
  }
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <h1 class="page-title">Settings</h1>
    <p class="page-sub">Business profile, invoice prefix, payment methods, and tax configuration.</p>
    @if (ready()) {
      <div class="alert alert-warning">{{ model.taxWarning || 'Tax configuration must be confirmed by the business accountant before production use.' }}</div>
      <div class="panel">
        <div class="row g-3">
          <div class="col-md-6"><label class="form-label">Business name</label><input class="form-control" [(ngModel)]="model.businessName" name="businessName" /></div>
          <div class="col-md-6"><label class="form-label">Phone</label><input class="form-control" [(ngModel)]="model.phone" name="phone" /></div>
          <div class="col-md-6"><label class="form-label">Email</label><input class="form-control" [(ngModel)]="model.email" name="email" /></div>
          <div class="col-md-6"><label class="form-label">GSTIN</label><input class="form-control" [(ngModel)]="model.gstin" name="gstin" /></div>
          <div class="col-md-6"><label class="form-label">Invoice prefix</label><input class="form-control" [(ngModel)]="model.invoicePrefix" name="invoicePrefix" /></div>
          <div class="col-12"><label class="form-label">Address</label><textarea class="form-control" rows="3" [(ngModel)]="model.address" name="address"></textarea></div>
          <div class="col-md-6">
            <div class="form-check mt-4">
              <input class="form-check-input" type="checkbox" id="neg" [(ngModel)]="model.allowNegativeStock" name="allowNegativeStock" />
              <label class="form-check-label" for="neg">Allow negative stock (off by default)</label>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-agri mt-3" (click)="save()">Save settings</button>
      </div>
      <div class="panel">
        <h2 class="h5">Tax rates</h2>
        <ul class="mb-0">
          @for (t of taxRates(); track t.id) { <li>{{ t.name }}: {{ t.rate }}%</li> }
        </ul>
      </div>
    }
  `,
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly ready = signal(false);
  readonly taxRates = signal<any[]>([]);
  model: any = {};

  ngOnInit() {
    void firstValueFrom(this.api.get<any>('/api/settings')).then((d) => {
      this.model = { ...d.settings };
      this.taxRates.set(d.taxRates || []);
      this.ready.set(true);
    });
  }

  async save() {
    const saved: any = await this.api.put('/api/settings', this.model);
    this.model = { ...saved.settings };
  }
}

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [IstDatePipe],
  template: `
    <h1 class="page-title">Audit log</h1>
    <p class="page-sub">Sensitive actions with safe before/after summaries. Secrets are never logged.</p>
    <div class="panel table-responsive">
      <table class="table table-sm">
        <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th></tr></thead>
        <tbody>
          @for (l of items(); track l.id) {
            <tr>
              <td>{{ l.createdAt | istDate }}</td>
              <td>{{ l.user?.name || '—' }}</td>
              <td>{{ l.action }}</td>
              <td>{{ l.entityType }} {{ l.entityId || '' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AuditComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly items = signal<any[]>([]);
  ngOnInit() {
    void firstValueFrom(this.api.get<{ items: any[] }>('/api/audit-logs')).then((d) => this.items.set(d.items));
  }
}
