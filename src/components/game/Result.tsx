'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CARD_COST, fmtClock, parText, timePenalty, WRONG_COST, type PlayerView } from '@/lib/game';
import type { ResultPayload } from '@/lib/result';
import type { PlayerStats } from '@/lib/playerStats';
import type { BoardRow } from '@/lib/repo';
import { Rich } from '../Blocks';

export type Challenge = { username: string; finished: boolean; score: number | null; solved: boolean | null; rank: number | null };

function useCountUp(target: number, ms = 900) {
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

function Confetti() {
  const colors = ['var(--stamp)', 'var(--ledger)', 'var(--hl)', 'var(--ink)'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % 4], animationDelay: `${(i % 7) * 0.08}s`, transform: `rotate(${i * 29}deg)` }} />
      ))}
    </div>
  );
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
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const vs = p.challenge && p.challenge.finished && p.challenge.score !== null ? score - p.challenge.score : null;

  return (
    <div className="result">
      {solved && p.ranked && <Confetti />}
      <div className={'stampmark big' + (solved ? ' solved' : '')}>{solved ? 'Case closed' : 'Case cold'}</div>

      <div className="score-hero">
        <div className="pts">{shown}<small>pts</small></div>
        {p.ranked && final?.rank ? (
          <div className="rank-line">
            <b>#{final.rank}</b> of {final.total.toLocaleString('en-IN')} today
            {final.percentile !== null && final.total > 1 && <span className="pill good">Beat {final.percentile}%</span>}
          </div>
        ) : !p.ranked ? (
          <div className="rank-line">Practice run · not ranked</div>
        ) : null}
        <div className="mini-stats">
          <span>📂 {n} file{n === 1 ? '' : 's'} · {parText(n, p.par)}</span>
          <span>❌ {w} wrong</span>
          <span>⏱ {fmtClock(secs)}</span>
        </div>
      </div>

      {p.ranked && vs !== null && (
        <div className={'vs ' + (vs > 0 ? 'win' : vs < 0 ? 'lose' : '')}>
          {vs > 0 ? `⚔️ You beat @${p.challenge!.username} by ${vs} pts!` : vs < 0 ? `⚔️ @${p.challenge!.username} beat you by ${-vs} pts. Rematch tomorrow?` : `⚔️ Dead heat with @${p.challenge!.username}.`}
        </div>
      )}

      {p.ranked && stats && (
        <div className="progress-card">
          <div className="streak">
            <span className="flame" aria-hidden="true">🔥</span>
            <div><b>{stats.streak}-day streak</b><span>{stats.streak > 1 ? `Best: ${stats.bestStreak}` : 'Come back tomorrow to build it'}</span></div>
          </div>
          <div className="career">
            <div className="career-top"><b>{stats.title}</b>{stats.next && <span>{stats.toNext.toLocaleString('en-IN')} pts to {stats.next}</span>}</div>
            <div className="bar-track"><div className="bar-fill ledger" style={{ width: `${stats.progress}%` }} /></div>
          </div>
        </div>
      )}

      {solved && p.skills.length > 0 && (
        <div className="skills-earned">
          <span className="foot">Skill sharpened</span>
          {p.skills.map((s) => <span key={s} className="chip skill">+ {s}</span>)}
        </div>
      )}

      {p.ranked && final && (
        <div className="challenge">
          <b>Challenge your friends</b>
          <span className="foot">They play the same case today. See who has the sharper business brain.</span>
          <div className="share-row">
            <button className="btn wa" onClick={() => p.onShare('whatsapp', final.share)}>WhatsApp</button>
            {canShare && <button className="btn ink" onClick={() => p.onShare('native', final.share)}>Share</button>}
            <button className="btn ghost" onClick={() => p.onShare('copy', final.share)}>{p.copied || 'Copy'}</button>
          </div>
        </div>
      )}

      {solved && view.bonusQuestion && (
        <div className="bonus">
          <div className="kicker">Bonus round · for fun, no points</div>
          <h4>{view.bonusQuestion.question}</h4>
          <div className="options">
            {view.bonusQuestion.options.map((o, i) => (
              <button key={i} disabled={p.bonusBusy} onClick={() => p.onBonus(i)} className={p.bonusPick === i ? 'picked' : ''}>
                <b>{String.fromCharCode(65 + i)}</b><span>{o}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {solved && !view.bonusQuestion && reveal.bonus && (
        <details className="fold">
          <summary>Bonus: {view.bonusCorrect ? '⭐ you got it' : 'not quite'}. See why</summary>
          <p><b>{reveal.bonus.question}</b></p>
          <p className="answer-line">✓ {reveal.bonus.options[reveal.bonus.answer_index]}</p>
          <p>{reveal.bonus.explanation}</p>
        </details>
      )}

      {p.ranked && final && <MiniBoard final={final} />}

      {p.ranked && <div className="next-case">Next case in <b>{p.nextIn}</b> · 9am IST</div>}

      <div className="takeaway">
        <div className="kicker">Today&apos;s takeaway</div>
        <p>{ex.lesson ?? ex.answer}</p>
      </div>

      <details className="fold">
        <summary>See the full solution</summary>
        <p><b>The answer:</b> <Rich text={ex.answer} /></p>
        {ex.why?.map((t, i) => <p key={i}><Rich text={t} /></p>)}
        {ex.cash_bridge && <p><b>The bridge:</b> <Rich text={ex.cash_bridge} /></p>}
        <p><b>Fastest path (par {p.par}):</b></p>
        <ol>{ex.fastest_path.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ol>
        <p><b>The traps:</b></p>
        <ul>{traps.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul>
        {ex.fix && <p><b>The fix:</b> <Rich text={ex.fix} /></p>}
        <p className="foot">Score: 1,000 − {n}×{CARD_COST} files − {w}×{WRONG_COST} wrong − {timePenalty(secs)} time{solved ? '' : ' (unsolved = 0)'}</p>
      </details>

      {reveal.bonus ? (
        <button className="linkbtn center" onClick={p.onPractice}>Replay for practice →</button>
      ) : (
        <span className="foot center">Answer the bonus to unlock practice replay.</span>
      )}
    </div>
  );
}

function MiniBoard({ final }: { final: ResultPayload }) {
  const me = final.me;
  const isMe = (r: BoardRow) => !!me && r.rank === me.rank && r.username === me.username;
  const top = final.preview.slice(0, 5);
  const extra = me && !top.some(isMe) ? final.around.filter((r) => !top.some((t) => t.rank === r.rank && t.username === r.username)) : [];
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`);
  return (
    <div className="miniboard">
      <div className="miniboard-head"><b>Today&apos;s leaderboard</b><Link href="/leaderboard">See all →</Link></div>
      {final.ahead && final.ahead.gap > 0 && (
        <div className="ahead">You&apos;re <b>{final.ahead.gap} pts</b> behind @{final.ahead.username}. Beat them tomorrow.</div>
      )}
      {final.rank === 1 && <div className="ahead win">👑 You&apos;re #1 today. Defend it tomorrow.</div>}
      <ol className="lb">
        {top.map((r, i) => (
          <li key={'t' + i} className={isMe(r) ? 'me' : ''}>
            <span className="lb-rank">{medal(r.rank)}</span>
            <span className="lb-name">{r.username}{isMe(r) ? ' (you)' : ''}</span>
            <span className="lb-score">{r.solved ? r.score : '—'}</span>
            <span className="lb-time">{fmtClock(r.elapsed_seconds)}</span>
          </li>
        ))}
        {extra.length > 0 && <li className="gap">⋯</li>}
        {extra.map((r, i) => (
          <li key={'a' + i} className={isMe(r) ? 'me' : ''}>
            <span className="lb-rank">#{r.rank}</span>
            <span className="lb-name">{r.username}{isMe(r) ? ' (you)' : ''}</span>
            <span className="lb-score">{r.solved ? r.score : '—'}</span>
            <span className="lb-time">{fmtClock(r.elapsed_seconds)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
