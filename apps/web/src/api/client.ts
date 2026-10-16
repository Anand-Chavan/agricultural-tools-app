const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

let csrfToken: string | null = null;

async function ensureCsrf() {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${API_BASE}/api/csrf`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch CSRF token');
  const data = await res.json();
  csrfToken = data.csrfToken as string;
  return csrfToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown; formData?: FormData } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = await ensureCsrf();
    headers.set('x-csrf-token', token);
  }

  let body = options.body;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }
  if (options.formData) {
    body = options.formData;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    body,
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403 && String(data?.error?.message || '').toLowerCase().includes('csrf')) {
      csrfToken = null;
    }
    throw new ApiError(
      res.status,
      data?.error?.message || res.statusText || 'Request failed',
      data?.error?.code,
      data?.error?.details,
    );
  }
  return data as T;
}

export function uploadUrl(storageKey?: string | null) {
  if (!storageKey) return null;
  if (storageKey.startsWith('http')) return storageKey;
  return `${API_BASE}/uploads/${storageKey}`;
}

export function formatINR(value: number | string | null | undefined) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDateIST(value?: string | Date | null) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}
