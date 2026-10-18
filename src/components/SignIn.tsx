'use client';
import { useEffect, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { track } from '@/lib/track';

type Step = 'email' | 'code' | 'username';

/**
 * Email → 4-digit code → username (first time only).
 * Falls back to Supabase's 6-digit code if our own mailer isn't configured.
 * `startAt="username"` is used when someone is signed in but never picked a name.
 */
export default function SignIn({ startAt = 'email', onDone, onClose }: { startAt?: Step; onDone: (username: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>(startAt);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [digits, setDigits] = useState(4);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    setErr('');
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter a valid email address.');
    setBusy(true);
    setErr('');
    const res = await fetch('/api/auth/code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 501) {
      // Our mailer isn't set up yet: use Supabase's own email code.
      const { error } = await browserClient().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      setBusy(false);
      if (error) return setErr(error.message);
      setDigits(6);
    } else {
      setBusy(false);
      if (!res.ok) return setErr(body.error?.message ?? 'Could not send a code. Try again.');
      setDigits(4);
    }
    setCode('');
    track('signin_code_sent');
    setStep('code');
    setResendIn(30);
  }

  async function verify(e?: React.FormEvent, value = code) {
    e?.preventDefault();
    const token = value.replace(/\D/g, '');
    if (token.length < digits) return setErr('Enter the code from your email.');
    setBusy(true);
    setErr('');
    if (digits === 4) {
      const res = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim(), code: token }) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setBusy(false);
        setCode('');
        return setErr(body.error?.message ?? 'That code is wrong or has expired.');
      }
      // The server set the session cookie; let the browser client pick it up.
      await browserClient().auth.getSession();
    } else {
      const { error } = await browserClient().auth.verifyOtp({ email: email.trim(), token, type: 'email' });
      if (error) {
        setBusy(false);
        return setErr(error.message.includes('expired') || error.message.includes('invalid') ? 'That code is wrong or has expired.' : error.message);
      }
    }
    track('signin_verified');
    const res = await fetch('/api/profile', { cache: 'no-store' }).then((r) => r.json());
    setBusy(false);
    if (res.me?.username) onDone(res.me.username);
    else setStep('username');
  }

  async function saveUsername(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setErr('');
    const res = await fetch('/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: username.trim() }) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(body.error?.message ?? 'Could not save that username.');
    track('username_set');
    onDone(body.username);
  }

  const stepNo = { email: 0, code: 1, username: 2 }[step];

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" data-clarity-mask="true" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="steps" aria-hidden="true">
          {[0, 1, 2].map((i) => <span key={i} className={i <= stepNo ? 'on' : ''} />)}
        </div>

        {step === 'email' && (
          <form onSubmit={sendCode} style={{ display: 'contents' }}>
            <div className="tag">Join today&apos;s leaderboard</div>
            <h3 id="signin-title">Sign in to start the clock</h3>
            <p>No password. We&apos;ll email you a short code.</p>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input ref={input} id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="err" role="alert">{err}</div>
            <button className="btn primary block" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
            <p className="privacy">We store your email, username and results to run the leaderboard and tell you when a new case is live. Your email is never shown. Delete your account any time.</p>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verify} style={{ display: 'contents' }}>
            <div className="tag">Check your inbox</div>
            <h3 id="signin-title">Enter the code</h3>
            <p>We sent a {digits}-digit code to <b>{email}</b>. Check spam if it&apos;s not there.</p>
            <div className="field">
              <label htmlFor="code">Code</label>
              <input
                ref={input}
                id="code"
                className="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={digits}
                placeholder={'•'.repeat(digits)}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, digits);
                  setCode(v);
                  if (v.length === digits && !busy) verify(undefined, v);
                }}
              />
            </div>
            <div className="err" role="alert">{err}</div>
            <button className="btn primary block" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
            <div className="accuse-row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="linkbtn" onClick={() => setStep('email')}>Use a different email</button>
              <button type="button" className="linkbtn" disabled={resendIn > 0 || busy} onClick={() => sendCode()}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {step === 'username' && (
          <form onSubmit={saveUsername} style={{ display: 'contents' }}>
            <div className="tag">One last thing</div>
            <h3 id="signin-title">Pick your detective name</h3>
            <p>It&apos;s what your friends will see on the leaderboard.</p>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input ref={input} id="username" autoComplete="nickname" autoCapitalize="none" spellCheck={false} maxLength={20} placeholder="sherlock_mba" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} />
            </div>
            <div className="err" role="alert">{err}</div>
            <button className="btn primary block" disabled={busy || username.length < 3}>{busy ? 'Saving…' : 'Start the case'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
