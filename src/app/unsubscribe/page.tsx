import type { Metadata } from 'next';
import UnsubscribeButton from './UnsubscribeButton';

export const metadata: Metadata = { title: 'Unsubscribe · Root Cause', robots: { index: false } };

export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  const { u, t } = await searchParams;
  return (
    <main className="wrap" style={{ marginTop: 16 }}>
      <section className="page">
        <div className="tag">Email preferences</div>
        <h1>Stop new-case emails?</h1>
        <p>You&apos;ll stop getting an email when each new case goes live. Your account, scores and leaderboard history stay as they are, and you can turn emails back on from the Account page.</p>
        {u && t ? <UnsubscribeButton u={u} t={t} /> : <p className="err">This link is incomplete. Use the link from your email, or change the setting on the Account page.</p>}
      </section>
    </main>
  );
}
