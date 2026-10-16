import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { AuditComponent, SettingsComponent, UsersComponent } from './pages/admin.component';
import { CustomerDetailComponent, CustomersComponent } from './pages/customers.component';
import { DashboardComponent } from './pages/dashboard.component';
import { InventoryComponent } from './pages/inventory.component';
import { LoginComponent } from './pages/login.component';
import { ProductDetailComponent, ProductsComponent } from './pages/products.component';
import { PurchasesComponent, SuppliersComponent } from './pages/purchases.component';
import { ReportsComponent } from './pages/reports.component';
import { InvoiceDetailComponent, NewInvoiceComponent, SalesComponent } from './pages/sales.component';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], component: LoginComponent },
  {
    path: '',
    canActivate: [authGuard],
    component: ShellComponent,
    children: [
      { path: '', component: DashboardComponent },
      { path: 'products', component: ProductsComponent },
      { path: 'products/:id', component: ProductDetailComponent },
      { path: 'inventory', component: InventoryComponent },
      { path: 'purchases', component: PurchasesComponent },
      { path: 'suppliers', component: SuppliersComponent },
      { path: 'sales', component: SalesComponent },
      { path: 'sales/new', component: NewInvoiceComponent },
      { path: 'sales/:id', component: InvoiceDetailComponent },
      { path: 'customers', component: CustomersComponent },
      { path: 'customers/:id', component: CustomerDetailComponent },
      { path: 'reports', component: ReportsComponent },
      { path: 'users', component: UsersComponent },
      { path: 'settings', component: SettingsComponent },
      { path: 'audit', component: AuditComponent },
    ],
  },
  { path: '**', redirectTo: '' },
];
