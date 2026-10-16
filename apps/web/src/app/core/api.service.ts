import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private csrfToken: string | null = null;

  async ensureCsrf(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    const data = await firstValueFrom(this.http.get<{ csrfToken: string }>('/api/csrf', { withCredentials: true }));
    this.csrfToken = data.csrfToken;
    return this.csrfToken;
  }

  clearCsrf() {
    this.csrfToken = null;
  }

  get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') httpParams = httpParams.set(k, String(v));
      }
    }
    return this.http.get<T>(path, { params: httpParams, withCredentials: true });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const headers = await this.mutatingHeaders();
    return firstValueFrom(this.http.post<T>(path, body ?? {}, { headers, withCredentials: true }));
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const headers = await this.mutatingHeaders();
    return firstValueFrom(this.http.put<T>(path, body ?? {}, { headers, withCredentials: true }));
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const headers = await this.mutatingHeaders();
    return firstValueFrom(this.http.patch<T>(path, body ?? {}, { headers, withCredentials: true }));
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const token = await this.ensureCsrf();
    const headers = new HttpHeaders({ 'x-csrf-token': token });
    return firstValueFrom(this.http.post<T>(path, formData, { headers, withCredentials: true }));
  }

  private async mutatingHeaders(): Promise<HttpHeaders> {
    const token = await this.ensureCsrf();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'x-csrf-token': token,
    });
  }
}

export function formatINR(value: number | string | null | undefined): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatDateIST(value?: string | Date | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function uploadUrl(storageKey?: string | null): string | null {
  if (!storageKey) return null;
  if (storageKey.startsWith('http')) return storageKey;
  return `/uploads/${storageKey}`;
}
