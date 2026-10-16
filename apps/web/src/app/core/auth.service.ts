import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly user = signal<AuthUser | null>(null);
  readonly loading = signal(true);
  readonly isAuthenticated = computed(() => !!this.user());

  async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      await this.api.ensureCsrf();
      const data = await firstValueFrom(this.api.get<{ user: AuthUser }>('/api/auth/me'));
      this.user.set(data.user);
    } catch {
      this.user.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async login(email: string, password: string): Promise<void> {
    const data = await this.api.post<{ user: AuthUser }>('/api/auth/login', { email, password });
    this.api.clearCsrf();
    await this.api.ensureCsrf();
    this.user.set(data.user);
  }

  async logout(): Promise<void> {
    try {
      await this.api.post('/api/auth/logout');
    } finally {
      this.user.set(null);
      this.api.clearCsrf();
      await this.router.navigateByUrl('/login');
    }
  }

  can(permission: string): boolean {
    return !!this.user()?.permissions.includes(permission);
  }
}
