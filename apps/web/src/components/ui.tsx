import type { ReactNode } from 'react';
import { formatINR } from '../api/client';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <div className="spinner-border text-success" />
      <div className="mt-2">{label}</div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3 className="h5 mb-1">{title}</h3>
      {hint ? <p className="mb-3">{hint}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <p className="text-danger mb-2">{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-sm btn-agri-outline btn-outline-success" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  let cls = 'status-chip';
  if (['UNPAID', 'VOIDED', 'CANCELLED', 'DANGER'].includes(s)) cls += ' danger';
  else if (['PARTIALLY_PAID', 'PARTIALLY_RECEIVED', 'DRAFT', 'LOW'].includes(s)) cls += ' warn';
  else if (['PAID', 'RECEIVED', 'ACTIVE', 'ISSUED', 'COMPLETED'].includes(s)) cls += ' ok';
  else cls += ' muted';
  return <span className={cls}>{s.replaceAll('_', ' ')}</span>;
}

export function MoneyDisplay({ value }: { value: number | string | null | undefined }) {
  return <span className="font-monospace">{formatINR(value)}</span>;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.35)' }} role="dialog">
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onCancel} aria-label="Close" />
          </div>
          <div className="modal-body">{body}</div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn-agri btn-success" onClick={onConfirm} disabled={busy}>
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SearchFilterBar({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="panel d-flex flex-wrap gap-2 align-items-end">{children}</div>;
}

export function ProductImage({
  src,
  alt,
  className = '',
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div className={`product-thumb d-flex align-items-center justify-content-center text-muted ${className}`}>
        No image
      </div>
    );
  }
  return <img src={src} alt={alt} className={`product-thumb ${className}`} />;
}
