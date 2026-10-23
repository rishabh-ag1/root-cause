import type { Metadata } from 'next';
import Link from 'next/link';
import Game from '@/components/Game';
import { todayPayload } from '@/lib/today';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: "Today's case · Root Cause" };

export default async function Play() {
  const initial = await todayPayload();
  if (!initial) {
    return (
      <main className="wrap" style={{ marginTop: 20 }}>
        <section className="page">
          <div className="tag">Root Cause</div>
          <h1>The next case goes live at 9am IST.</h1>
          <p><Link href="/">How the game works</Link></p>
        </section>
      </main>
    );
  }
  return <Game initial={initial} />;
}
