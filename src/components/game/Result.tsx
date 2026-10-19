'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CARD_COST, fmtClock, parText, timePenalty, WRONG_COST, type PlayerView } from '@/lib/game';
import type { ResultPayload } from '@/lib/result';
import type { PlayerStats } from '@/lib/playerStats';
import type { BoardRow } from '@/lib/repo';
import { Rich } from '../Blocks';

export type Challenge = { username: string; finished: boolean; score: number | null; solved: boolean | null; rank: number | null };

function useCountUp(target: number, ms = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export default function Result(p: {
  view: PlayerView;
  ranked: boolean;
  par: number;
  caseNumber: number;
  skills: string[];
  final: ResultPayload | null;
  stats: PlayerStats | null;
  challenge: Challenge | null;
  bonusPick: number | null;
  bonusBusy: boolean;
  onBonus: (i: number) => void;
  onShare: (via: 'whatsapp' | 'native' | 'copy', text: string) => void;
  copied: string;
  onPractice: () => void;
  nextIn: string;
}) {
  const { view, final, stats } = p;
  const reveal = view.reveal!;
  const solved = !!view.solved;
  const score = view.score ?? 0;
  const shown = useCountUp(score);
  const n = view.opened.length;
  const w = view.wrong.length;
  const secs = view.elapsedSeconds ?? 0;
  const ex = reveal.explanation;
  const traps = Array.isArray(ex.traps) ? ex.traps : [ex.traps];
  const vs = p.challenge?.finished && p.challenge.score !== null ? score - p.challenge.score : null;

  return (
    <div className="result">
      <header className="r-head">
        <div className={'r-stamp' + (solved ? ' ok' : '')}>{solved ? 'Case closed' : 'Case cold'}</div>
        <div className="r-score">{shown}<span>points</span></div>
        <p className="r-rank">
          {p.ranked && final?.rank ? (
            <>
              <b>#{final.rank}</b> of {final.total.toLocaleString('en-IN')} today
              {final.percentile !== null && final.total > 1 && <> · better than {final.percentile}%</>}
            </>
          ) : !p.ranked ? 'Practice run, not ranked' : null}
        </p>
        <p className="r-line">{n} file{n === 1 ? '' : 's'} ({parText(n, p.par)}) · {w} wrong · {fmtClock(secs)}</p>
      </header>

      {p.ranked && vs !== null && (
        <p className="r-note">
          {vs > 0 ? `You beat @${p.challenge!.username} by ${vs} points.` : vs < 0 ? `@${p.challenge!.username} beat you by ${-vs} points.` : `You tied with @${p.challenge!.username}.`}
        </p>
      )}

      {p.ranked && stats && (
        <dl className="r-stats">
          <div><dt>Streak</dt><dd>{stats.streak} day{stats.streak === 1 ? '' : 's'}</dd></div>
          <div><dt>Rank title</dt><dd>{stats.title}</dd></div>
          <div><dt>Total points</dt><dd>{stats.totalPoints.toLocaleString('en-IN')}</dd></div>
        </dl>
      )}
      {p.ranked && stats?.next && (
        <div className="r-progress">
          <div className="track"><div style={{ width: `${stats.progress}%` }} /></div>
          <span>{stats.toNext.toLocaleString('en-IN')} points to {stats.next}</span>
        </div>
      )}

      {p.ranked && final && (
        <div className="r-actions">
          <button className="btn primary block" onClick={() => p.onShare('whatsapp', final.share)}>Challenge a friend</button>
          <div className="r-actions-row">
            {typeof navigator !== 'undefined' && 'share' in navigator && <button className="textbtn" onClick={() => p.onShare('native', final.share)}>Share</button>}
            <button className="textbtn" onClick={() => p.onShare('copy', final.share)}>{p.copied || 'Copy result'}</button>
          </div>
        </div>
      )}

      {p.ranked && final && <Board final={final} />}

      {p.ranked && <p className="r-next">Next case in {p.nextIn}, at 9am.</p>}

      <section className="r-block">
        <h4>Takeaway</h4>
        <p className="r-lesson">{ex.lesson ?? ex.answer}</p>
        {solved && p.skills.length > 0 && <p className="muted small">Skill practised: {p.skills.join(', ')}</p>}
      </section>

      {solved && view.bonusQuestion && (
        <section className="r-block">
          <h4>Bonus question <span className="muted">· just for fun</span></h4>
          <p>{view.bonusQuestion.question}</p>
          <div className="options">
            {view.bonusQuestion.options.map((o, i) => (
              <button key={i} disabled={p.bonusBusy} onClick={() => p.onBonus(i)} className={p.bonusPick === i ? 'picked' : ''}>
                <b>{String.fromCharCode(65 + i)}</b><span>{o}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <details className="fold">
        <summary>Solution</summary>
        <p><Rich text={ex.answer} /></p>
        {ex.why?.map((t, i) => <p key={i}><Rich text={t} /></p>)}
        {ex.cash_bridge && <p><Rich text={ex.cash_bridge} /></p>}
        <p><b>Fastest path ({p.par} files)</b></p>
        <ol>{ex.fastest_path.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ol>
        <p><b>Traps</b></p>
        <ul>{traps.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul>
        {ex.fix && <p><b>The fix:</b> <Rich text={ex.fix} /></p>}
        {solved && !view.bonusQuestion && reveal.bonus && (
          <p><b>Bonus:</b> {reveal.bonus.options[reveal.bonus.answer_index]} {view.bonusCorrect ? '(you got it)' : ''}</p>
        )}
        <p className="muted small">1,000 − {n} × {CARD_COST} − {w} × {WRONG_COST} − {timePenalty(secs)} for time{solved ? '' : ' (unsolved scores 0)'}.</p>
      </details>

      {reveal.bonus && <button className="textbtn center" onClick={p.onPractice}>Replay for practice</button>}
    </div>
  );
}

function Board({ final }: { final: ResultPayload }) {
  const me = final.me;
  const isMe = (r: BoardRow) => !!me && r.rank === me.rank && r.username === me.username;
  const top = final.preview.slice(0, 5);
  const extra = me && !top.some(isMe) ? final.around.filter((r) => !top.some((t) => t.rank === r.rank && t.username === r.username)) : [];
  const row = (r: BoardRow, k: string) => (
    <li key={k} className={isMe(r) ? 'me' : ''}>
      <span className="b-rank">{r.rank}</span>
      <span className="b-name">{r.username}{isMe(r) ? ' (you)' : ''}</span>
      <span className="b-score">{r.solved ? r.score : '—'}</span>
    </li>
  );
  return (
    <section className="r-block">
      <div className="r-block-head">
        <h4>Today&apos;s leaderboard</h4>
        <Link href="/leaderboard">See all</Link>
      </div>
      {final.ahead && final.ahead.gap > 0 && <p className="muted small">{final.ahead.gap} points behind @{final.ahead.username}.</p>}
      <ol className="board-list">
        {top.map((r, i) => row(r, 't' + i))}
        {extra.length > 0 && <li className="sep" aria-hidden="true">···</li>}
        {extra.map((r, i) => row(r, 'a' + i))}
      </ol>
    </section>
  );
}
