'use client';
import Link from 'next/link';
import { useState } from 'react';

export default function UnsubscribeButton({ u, t }: { u: string; t: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');

  async function go() {
    setState('busy');
    const res = await fetch('/api/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ u, t }) });
    if (res.ok) return setState('done');
    const body = await res.json().catch(() => ({}));
    setErr(body.error?.message ?? 'Something went wrong. Try again.');
    setState('error');
  }

  if (state === 'done')
    return (
      <p className="copied" style={{ fontSize: 14 }}>
        Done. You won&apos;t get new-case emails any more. <Link href="/">Play today&apos;s case →</Link>
      </p>
    );
  return (
    <div className="accuse-row">
      <button className="btn primary" onClick={go} disabled={state === 'busy'}>{state === 'busy' ? 'Saving…' : 'Unsubscribe'}</button>
      <Link className="btn ghost" href="/">Keep them coming</Link>
      {state === 'error' && <span className="err">{err}</span>}
    </div>
  );
}
