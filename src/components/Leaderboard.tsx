'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { fmtClock } from '@/lib/game';
import type { BoardRow, WeekRow } from '@/lib/repo';

type CaseBoard = { range: 'case'; caseNumber: number; company: string; par: number; top: BoardRow[]; total: number; me: BoardRow | null; around: BoardRow[] };
type WeekBoard = { range: 'week'; top: WeekRow[]; me: WeekRow | null };

const REFRESH_MS = 15_000;
const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);

export default function Leaderboard() {
  const [range, setRange] = useState<'case' | 'week'>('case');
  const [data, setData] = useState<CaseBoard | WeekBoard | null>(null);
  const [err, setErr] = useState('');
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/leaderboard?range=${range}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message ?? 'Could not load the leaderboard.');
      setData(body);
      setErr('');
      setUpdated(new Date());
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [range]);

  useEffect(() => {
    setData(null);
    load();
    // Live: refresh while the tab is visible.
    const t = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  return (
    <main className="wrap" style={{ marginTop: 16 }}>
      <section className="board">
        <h2>
          {range === 'case' && data?.range === 'case' ? `Case #${data.caseNumber} · ${data.company}` : range === 'week' ? 'Last 7 days' : 'Leaderboard'}
          <span className="live">Live{updated ? ` · ${updated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span>
        </h2>
        <div className="accuse-row" style={{ justifyContent: 'space-between' }}>
          <div className="seg" role="group" aria-label="Range">
            <button aria-pressed={range === 'case'} onClick={() => setRange('case')}>Today</button>
            <button aria-pressed={range === 'week'} onClick={() => setRange('week')}>Last 7 days</button>
          </div>
          {data?.range === 'case' && <span className="foot">{data.total.toLocaleString('en-IN')} detectives played</span>}
        </div>

        {err && <p className="err">{err}</p>}
        {!data && !err && <div className="skeleton" />}
        {data?.range === 'case' && <CaseTable d={data} />}
        {data?.range === 'week' && <WeekTable d={data} />}
      </section>
      <p className="foot" style={{ textAlign: 'center' }}>
        Ranked by score, then time, then who finished first. <Link href="/">Play today&apos;s case →</Link>
      </p>
    </main>
  );
}

function CaseTable({ d }: { d: CaseBoard }) {
  if (!d.top.length) return <p className="empty">No one has closed this case yet. Be the first.</p>;
  const isMe = (r: BoardRow) => !!d.me && r.rank === d.me.rank && r.username === d.me.username;
  const row = (r: BoardRow, i: number) => (
    <tr key={r.username + i} className={isMe(r) ? 'me' : ''} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}>
      <td className="rk"><span className="medal">{medal(r.rank)}</span></td>
      <td className="user">{r.username}{isMe(r) ? ' (you)' : ''}</td>
      <td>{r.solved ? r.score : '—'}</td>
      <td className="hide-sm">{r.files} / {'❌'.repeat(r.wrong) || '0'}</td>
      <td>{fmtClock(r.elapsed_seconds)}</td>
      <td className="hide-sm">{r.bonus_correct ? '★' : ''}</td>
    </tr>
  );
  return (
    <div className="tbl">
      <table>
        <thead>
          <tr><th>Rank</th><th style={{ textAlign: 'left' }}>Detective</th><th>Score</th><th className="hide-sm">Files / misses</th><th>Time</th><th className="hide-sm">Bonus</th></tr>
        </thead>
        <tbody>
          {d.top.map(row)}
          {d.around.length > 0 && (
            <>
              <tr className="gap"><td colSpan={6}>⋯</td></tr>
              {d.around.map((r, i) => row(r, 100 + i))}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WeekTable({ d }: { d: WeekBoard }) {
  if (!d.top.length) return <p className="empty">No results this week yet.</p>;
  const isMe = (r: WeekRow) => !!d.me && r.rank === d.me.rank && r.username === d.me.username;
  const meShown = d.top.some(isMe);
  const row = (r: WeekRow, i: number) => (
    <tr key={r.username + i} className={isMe(r) ? 'me' : ''} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}>
      <td className="rk"><span className="medal">{medal(r.rank)}</span></td>
      <td className="user">{r.username}{isMe(r) ? ' (you)' : ''}</td>
      <td>{Number(r.score).toLocaleString('en-IN')}</td>
      <td>{r.played}</td>
    </tr>
  );
  return (
    <div className="tbl">
      <table>
        <thead><tr><th>Rank</th><th style={{ textAlign: 'left' }}>Detective</th><th>Total</th><th>Cases</th></tr></thead>
        <tbody>
          {d.top.map(row)}
          {d.me && !meShown && (
            <>
              <tr className="gap"><td colSpan={4}>⋯</td></tr>
              {row(d.me, 100)}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
