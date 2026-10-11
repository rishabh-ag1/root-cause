'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import SignIn from '@/components/SignIn';
import { resetIdentity, track } from '@/lib/track';

type Me = { id: string; email: string | null; username: string | null } | null;

export default function Settings() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [sheet, setSheet] = useState<null | 'email' | 'username'>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () =>
    fetch('/api/profile', { cache: 'no-store' })
      .then((r) => r.json())
      .then((b) => setMe(b.me ?? null))
      .catch(() => setMe(null));

  useEffect(() => {
    load();
  }, []);

  async function signOut() {
    await browserClient().auth.signOut();
    track('sign_out');
    resetIdentity();
    setMe(null);
    setMsg('Signed out.');
  }

  async function del() {
    setBusy(true);
    const res = await fetch('/api/account/delete', { method: 'POST' });
    setBusy(false);
    if (!res.ok) return setMsg('Could not delete your account. Try again.');
    await browserClient().auth.signOut().catch(() => {});
    track('account_deleted');
    resetIdentity();
    setMe(null);
    setConfirm('');
    setMsg('Your account and all your results have been deleted.');
  }

  return (
    <main className="wrap" style={{ marginTop: 16 }}>
      <section className="page">
        <div className="tag">Account</div>
        {me === undefined && <div className="skeleton" />}
        {me === null && (
          <>
            <h1>You&apos;re not signed in</h1>
            <p>Sign in with your email to play ranked and appear on the leaderboard.</p>
            <div className="accuse-row"><button className="btn primary" onClick={() => setSheet('email')}>Sign in</button></div>
          </>
        )}
        {me && (
          <>
            <h1>{me.username ?? 'No username yet'}</h1>
            <p className="foot">Signed in as {me.email}. Your email is never shown publicly.</p>
            <div className="accuse-row">
              {!me.username && <button className="btn primary" onClick={() => setSheet('username')}>Pick a username</button>}
              <button className="btn ghost" onClick={signOut}>Sign out</button>
            </div>
          </>
        )}
        {msg && <p className="copied">{msg}</p>}
      </section>

      {me && (
        <section className="page">
          <h2>Delete my account</h2>
          <p>This permanently deletes your email, username and every game result. It can&apos;t be undone. Type <b>DELETE</b> to confirm.</p>
          <div className="field" style={{ maxWidth: 260 }}>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" aria-label="Type DELETE to confirm" />
          </div>
          <div className="accuse-row">
            <button className="btn ghost danger" disabled={confirm !== 'DELETE' || busy} onClick={del}>{busy ? 'Deleting…' : 'Delete my account'}</button>
          </div>
        </section>
      )}

      <section className="page">
        <h2>Privacy</h2>
        <p>
          We store your email, your username and your game results. We use them to run the leaderboard and, if you opt in later, to send your daily result. We don&apos;t sell data or show your email to anyone. See the <Link href="/privacy">privacy notice</Link>.
        </p>
      </section>

      {sheet && <SignIn startAt={sheet} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }} />}
    </main>
  );
}
