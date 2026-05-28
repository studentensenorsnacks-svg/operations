'use client';

import type { ApiError } from '@/lib/client';

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof Error ? error.message : String(error ?? 'Onbekende fout');
  const status = (error as Partial<ApiError>)?.status;
  const body = (error as Partial<ApiError>)?.body;
  return (
    <div className="alert alert-error">
      <strong>Fout{status ? ` (${status})` : ''}:</strong> {message}
      {body && typeof body === 'object' && 'errors' in body ? (
        <ul style={{ margin: '8px 0 0 18px' }}>
          {Object.entries((body as { errors: Record<string, string[]> }).errors).map(
            ([key, msgs]) => (
              <li key={key}>
                <strong>{key}:</strong> {msgs.join(', ')}
              </li>
            ),
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function SuccessAlert({ children }: { children: React.ReactNode }) {
  return <div className="alert alert-success">{children}</div>;
}

export function InfoAlert({ children }: { children: React.ReactNode }) {
  return <div className="alert alert-info">{children}</div>;
}

export function WarnAlert({ children }: { children: React.ReactNode }) {
  return <div className="alert alert-warn">{children}</div>;
}
