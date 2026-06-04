'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorAlert } from '@/components/Alert';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || `Inloggen mislukt (${res.status})`);
      }
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next');
      const target = next && next.startsWith('/') ? next : '/';
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-bar" />
          EventPay beheer
        </div>
        <p className="auth-sub">Log in om verder te gaan.</p>

        <ErrorAlert error={error} />

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-user">Gebruikersnaam</label>
            <input
              id="login-user"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="login-pass">Code</label>
            <input
              id="login-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button
            type="submit"
            className="btn"
            style={{ width: '100%' }}
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? <span className="loading" /> : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  );
}
