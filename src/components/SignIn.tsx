'use client';
import { useEffect, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';

type Step = 'email' | 'code' | 'username';

/**
 * Email → 6-digit code → username (first time only).
 * `startAt="username"` is used when someone is signed in but never picked a name.
 */
export default function SignIn({ startAt = 'email', onDone, onClose }: { startAt?: Step; onDone: (username: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>(startAt);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
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
    const { error } = await browserClient().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setErr(error.message);
    setStep('code');
    setResendIn(45);
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return setErr('Enter the code from your email.');
    setBusy(true);
    setErr('');
    const { error } = await browserClient().auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    if (error) {
      setBusy(false);
      return setErr(error.message.includes('expired') || error.message.includes('invalid') ? 'That code is wrong or has expired.' : error.message);
    }
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
    onDone(body.username);
  }

  const stepNo = { email: 0, code: 1, username: 2 }[step];

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="steps" aria-hidden="true">
          {[0, 1, 2].map((i) => <span key={i} className={i <= stepNo ? 'on' : ''} />)}
        </div>

        {step === 'email' && (
          <form onSubmit={sendCode} style={{ display: 'contents' }}>
            <div className="tag">Ranked play</div>
            <h3 id="signin-title">Sign in to open the evidence</h3>
            <p>Everyone gets the same case today. Sign in so your score lands on the leaderboard. No password: we email you a 6-digit code.</p>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input ref={input} id="email" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="err" role="alert">{err}</div>
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
            <p className="privacy">
              We store your email, a username and your game results, to run the leaderboard and send your daily result. Your email is never shown publicly. You can delete your account any time from Account.
            </p>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verify} style={{ display: 'contents' }}>
            <div className="tag">Check your inbox</div>
            <h3 id="signin-title">Enter the code</h3>
            <p>We sent a code to <b>{email}</b>.</p>
            <div className="field">
              <label htmlFor="code">Code</label>
              <input
                ref={input}
                id="code"
                className="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                placeholder="••••••"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '');
                  setCode(v);
                }}
              />
            </div>
            <div className="err" role="alert">{err}</div>
            <button className="btn primary" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
            <div className="accuse-row">
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
            <p>This is what shows on the leaderboard. 3-20 letters, numbers or underscores.</p>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input ref={input} id="username" autoComplete="nickname" autoCapitalize="none" spellCheck={false} maxLength={20} placeholder="sherlock_mba" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} />
            </div>
            <div className="err" role="alert">{err}</div>
            <button className="btn primary" disabled={busy || username.length < 3}>{busy ? 'Saving…' : 'Start the case'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
