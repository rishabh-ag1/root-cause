import Game from '@/components/Game';
import { todayPayload } from '@/lib/today';

export const dynamic = 'force-dynamic';

export default async function Today() {
  const initial = await todayPayload();
  if (!initial) {
    return (
      <main className="wrap" style={{ marginTop: 20 }}>
        <section className="page">
          <div className="tag">Root Cause</div>
          <h1>The first case drops at midnight IST.</h1>
          <p>One business mystery a day. Open as few evidence files as you can, name the root cause, and see where you rank.</p>
        </section>
      </main>
    );
  }
  return <Game initial={initial} />;
}
