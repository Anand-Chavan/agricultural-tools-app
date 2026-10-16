import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-page">
      <form class="login-panel" (ngSubmit)="submit()" novalidate>
        <h1>Agricultural Tools</h1>
        <p class="text-muted mb-4">Sign in to the business management workspace.</p>
        @if (error()) {
          <div class="alert alert-danger py-2">{{ error() }}</div>
        }
        <div class="mb-3">
          <label class="form-label" for="email">Email</label>
          <input id="email" class="form-control" type="email" [(ngModel)]="email" name="email" required autocomplete="username" />
        </div>
        <div class="mb-3">
          <label class="form-label" for="password">Password</label>
          <div class="input-group">
            <input
              id="password"
              class="form-control"
              [type]="showPassword() ? 'text' : 'password'"
              [(ngModel)]="password"
              name="password"
              required
              autocomplete="current-password"
            />
            <button type="button" class="btn btn-outline-secondary" (click)="showPassword.set(!showPassword())">
              {{ showPassword() ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>
        <button type="submit" class="btn btn-agri w-100" [disabled]="busy()">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>
        <p class="small text-muted mt-3 mb-0">Demo users are development-only. Change passwords before any real use.</p>
      </form>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = 'admin@demo.local';
  password = 'ChangeMe123!';
  readonly showPassword = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  async submit() {
    this.error.set('');
    if (!this.email || !this.password) {
      this.error.set('Email and password are required.');
      return;
    }
    this.busy.set(true);
    try {
      await this.auth.login(this.email.trim(), this.password);
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set('Invalid email or password.');
    } finally {
      this.busy.set(false);
    }
  }
}
