'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAccuse, applyBonus, applyOpen, BONUS_POINTS, CARD_COST, computeScore, elapsedSeconds, emptyAttempt, fmtClock, MAX_WRONG,
  parText, playerView, START_POINTS, timePenalty, TIME_CAP, WRONG_COST, type Attempt, type PlayerView, type StoredCase,
} from '@/lib/game';
import type { TodayPayload } from '@/lib/today';
import type { ResultPayload } from '@/lib/result';
import { Blocks, Rich } from './Blocks';
import SignIn from './SignIn';

type Practice = { attempt: Attempt; c: StoredCase; bonusPick: number | null };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function msToIstMidnight(now: number) {
  const ist = now + 5.5 * 3600_000;
  return 86_400_000 - (ist % 86_400_000);
}

function fmtCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

export default function Game({ initial }: { initial: TodayPayload }) {
  const pc = initial.case;
  const [me, setMe] = useState(initial.me);
  const [att, setAtt] = useState<PlayerView | null>(initial.attempt);
  const [final, setFinal] = useState<ResultPayload | null>(initial.final);
  const [offset, setOffset] = useState(() => new Date(initial.serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'email' | 'username'>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [bonusPick, setBonusPick] = useState<number | null>(null);
  const [hitKey, setHitKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const pending = useRef<null | { kind: 'open'; index: number } | { kind: 'accuse' }>(null);
  const alreadyPlayed = useRef(!!initial.attempt?.finished);
  const bonusRef = useRef<HTMLDivElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);

  const view: PlayerView | null = practice ? playerView(practice.attempt, practice.c) : att;
  const ranked = !practice;
  const finished = !!view?.finished;
  const solvedPending = !!view?.solved && !finished;
  const fileCount = pc.files.length;
  const opened = view?.opened ?? [];
  const wrong = view?.wrong ?? [];

  // ---- clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const serverNow = practice ? now : now + offset;
  const secs = view?.startedAt
    ? view.elapsedSeconds ?? elapsedSeconds(view.startedAt, view.solvedAt ?? new Date(serverNow).toISOString())
    : 0;
  const livePoints = finished
    ? view!.score ?? 0
    : Math.max(0, START_POINTS - CARD_COST * opened.length - WRONG_COST * wrong.length - timePenalty(secs));

  const sync = useCallback((serverIso: string) => setOffset(new Date(serverIso).getTime() - Date.now()), []);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/case/today', { cache: 'no-store' });
    if (!res.ok) return null;
    const p = (await res.json()) as TodayPayload;
    sync(p.serverNow);
    setMe(p.me);
    setAtt(p.attempt);
    setFinal(p.final);
    alreadyPlayed.current = !!p.attempt?.finished;
    return p;
  }, [sync]);

  function handleError(status: number, data: { error?: { code?: string; message?: string } }) {
    if (status === 401) {
      setMe(null);
      setSheet('email');
      return;
    }
    if (status === 403 && data.error?.code === 'username') {
      setSheet('username');
      return;
    }
    setToast(data.error?.message ?? 'Something went wrong. Try again.');
    if (status === 409) refresh();
  }

  /** Ranked actions need an account. Remember what the player tapped and resume after sign-in. */
  function needAccount(action: NonNullable<typeof pending.current>) {
    if (practice) return false;
    if (!me) {
      pending.current = action;
      setSheet('email');
      return true;
    }
    if (!me.username) {
      pending.current = action;
      setSheet('username');
      return true;
    }
    return false;
  }

  async function onSignedIn(username: string) {
    setSheet(null);
    setToast(`Signed in as ${username}`);
    const p = await refresh();
    const action = pending.current;
    pending.current = null;
    if (!p || p.attempt?.finished || !action) return;
    if (action.kind === 'open') openFile(action.index, p.attempt);
  }

  // ---- open a file
  async function openFile(i: number, current: PlayerView | null = att) {
    if (practice) {
      const { attempt } = applyOpen(practice.attempt, practice.c, i, new Date().toISOString());
      setPractice({ ...practice, attempt });
      setHitKey((k) => k + 1);
      return;
    }
    if (needAccount({ kind: 'open', index: i })) return;
    if (current?.bodies[i]) return;
    setBusy('open' + i);
    const { ok, status, data } = await post('/api/attempt/open', { caseId: pc.id, index: i });
    setBusy(null);
    if (!ok) return handleError(status, data);
    sync(data.serverNow);
    setAtt((a) => {
      const base = a ?? playerView(emptyAttempt(), { evidence: [], causes: [] } as unknown as StoredCase);
      return { ...base, startedAt: data.startedAt, opened: data.opened, bodies: { ...base.bodies, [i]: data.body } };
    });
    setHitKey((k) => k + 1);
  }

  // ---- accuse
  async function accuse() {
    if (selected === null || finished || solvedPending) return;
    if (practice) {
      const { attempt, out } = applyAccuse(practice.attempt, practice.c, selected, new Date().toISOString());
      setPractice({ ...practice, attempt });
      setSelected(null);
      if (out.result === 'correct') setTimeout(() => bonusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      else setHitKey((k) => k + 1);
      if (out.result === 'unsolved') setTimeout(() => verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return;
    }
    if (needAccount({ kind: 'accuse' })) return;
    setBusy('accuse');
    const { ok, status, data } = await post('/api/attempt/accuse', { caseId: pc.id, causeIndex: selected });
    setBusy(null);
    if (!ok) return handleError(status, data);
    sync(data.serverNow);
    setAtt(data.attempt);
    setSelected(null);
    if (data.final) setFinal(data.final);
    if (data.result === 'correct') setTimeout(() => bonusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    else setHitKey((k) => k + 1);
    if (data.result === 'unsolved') setTimeout(() => verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // ---- bonus
  async function answerBonus(i: number) {
    if (!solvedPending) return;
    if (practice) {
      const { attempt } = applyBonus(practice.attempt, practice.c, i, new Date().toISOString());
      setPractice({ ...practice, attempt, bonusPick: i });
      setTimeout(() => verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      return;
    }
    setBusy('bonus');
    setBonusPick(i);
    const { ok, status, data } = await post('/api/attempt/bonus', { caseId: pc.id, optionIndex: i });
    setBusy(null);
    if (!ok) {
      setBonusPick(null);
      return handleError(status, data);
    }
    setAtt(data.attempt);
    setFinal(data.final);
    setTimeout(() => verdictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function startPractice() {
    const reveal = (att ?? view)?.reveal;
    if (!reveal) return;
    const c: StoredCase = {
      id: pc.id, case_number: pc.caseNumber, publish_date: pc.publishDate, difficulty: pc.difficulty as StoredCase['difficulty'],
      title: pc.title, company: pc.company, brief: pc.brief, par: pc.par, status: 'live',
      evidence: pc.files.map((f, i) => ({ ...f, body: reveal.practice.bodies[i] })),
      causes: pc.causes.map((label, i) => ({ label, feedback: reveal.practice.feedback[i] })),
      answer_index: reveal.answerIndex, bonus: reveal.bonus, explanation: reveal.explanation,
    };
    setPractice({ attempt: emptyAttempt(), c, bonusPick: null });
    setSelected(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function exitPractice() {
    setPractice(null);
    setSelected(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function copyShare(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied. Paste it anywhere.');
    } catch {
      setCopied('Select the text above and copy it.');
    }
  }

  async function nativeShare(text: string) {
    try {
      await navigator.share({ text });
    } catch {}
  }

  const dateTxt = useMemo(
    () => new Date(pc.publishDate + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).toUpperCase(),
    [pc.publishDate],
  );

  const reveal = view?.reveal ?? null;
  const pickedBonus = practice ? practice.bonusPick : bonusPick;

  return (
    <main className="wrap">
      <div className="hud">
        <div className="brand">
          Root Cause<small>CASE #{pc.caseNumber} · {dateTxt}</small>
        </div>
        <div className="stats">
          <div className="stat"><span className="k">Points</span><span key={hitKey} className={'v' + (hitKey ? ' hit' : '')}>{livePoints}</span></div>
          <div className="stat"><span className="k">Files</span><span className="v">{opened.length} / {fileCount}</span></div>
          <div className="stat"><span className="k">Accusations</span><span className="v dots">{'●'.repeat(MAX_WRONG - wrong.length)}{'○'.repeat(wrong.length)}</span></div>
          <div className="stat"><span className="k">Clock</span><span className="v">{fmtClock(secs)}</span></div>
        </div>
      </div>

      {practice && (
        <div className="banner warn">
          <span><b>Practice replay.</b> This run doesn&apos;t count toward the leaderboard.</span>
          <button className="btn ghost small" onClick={exitPractice}>Back to my result</button>
        </div>
      )}
      {!practice && alreadyPlayed.current && att?.finished && (
        <div className="banner">
          <span>
            You played today&apos;s case: <b>{att.solved ? `${att.score} points` : 'unsolved'}</b>
            {final?.rank ? <> · <b>#{final.rank}</b> of {final.total.toLocaleString('en-IN')}</> : null}. Next case in <b>{fmtCountdown(msToIstMidnight(serverNow))}</b>.
          </span>
          <a className="btn ghost small" href="#verdict">See result</a>
        </div>
      )}

      <section className="brief">
        <div className="tag">{pc.brief.tag}</div>
        <h1>{pc.brief.headline}</h1>
        <p>{pc.brief.story}</p>
        <div className="facts">
          {pc.brief.facts.map((f, i) => (
            <span key={i} className={'fact' + (f.tone === 'down' ? ' down' : '')}>
              {f.label} <b>{f.value}</b>
            </span>
          ))}
        </div>
        <div className="rules">
          <b>How it works.</b> You start with 1,000 points. Opening an evidence file costs <b>{CARD_COST}</b>. A wrong accusation costs <b>{WRONG_COST}</b>, and you get {MAX_WRONG}. The clock starts when you open your first file and costs 1 point every 3 seconds (up to {TIME_CAP}). Crack it and answer a bonus question for <b>+{BONUS_POINTS}</b>. This case can be cracked with <b>{pc.par} files</b>. Read the brief as long as you like first.
        </div>
      </section>

      <section className="section">
        <h2>Evidence <span>Each file costs {CARD_COST} points to open</span></h2>
        <div className="evidence">
          {pc.files.map((f, i) => {
            const body = view?.bodies[i];
            const isBusy = busy === 'open' + i;
            return (
              <div key={i} className={'card' + (body ? ' open' : '')}>
                <div className="card-top">
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  <div className="card-title"><b>{f.title}</b><i>{f.teaser}</i></div>
                  {!body && (
                    <button className={'openbtn' + (isBusy ? ' busy' : '')} disabled={finished || solvedPending || !!busy} onClick={() => openFile(i)}>
                      {isBusy ? 'Opening…' : `Open · −${CARD_COST}`}
                    </button>
                  )}
                </div>
                {body && <div className="card-body"><Blocks blocks={body} /></div>}
              </div>
            );
          })}
        </div>
      </section>

      {!solvedPending && (
        <section className="accuse">
          <h2>{finished ? 'The accusation' : 'Make your accusation'} <span>{finished ? 'Green is the root cause' : `Wrong answer costs ${WRONG_COST}`}</span></h2>
          <div className="causes">
            {pc.causes.map((label, i) => {
              const ruled = wrong.some((w) => w.index === i);
              const isAnswer = finished && reveal?.answerIndex === i;
              const disabled = ruled || finished;
              return (
                <label key={i} className={[isAnswer ? 'answer' : ruled ? 'ruled' : '', disabled ? 'disabled' : ''].join(' ')}>
                  <input type="radio" name="cause" value={i} disabled={disabled} checked={selected === i} onChange={() => setSelected(i)} />
                  <span className="box" />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
          {!finished && (
            <div className="accuse-row">
              <button className="btn primary" disabled={selected === null || !!busy} onClick={accuse}>{busy === 'accuse' ? 'Checking…' : 'Accuse'}</button>
              <span className="foot">Pick the single biggest reason for the problem.</span>
            </div>
          )}
          {wrong.length > 0 && (
            <div className="feedback">
              {wrong.map((w) => (
                <div key={w.index} className="fb"><b>Not it.</b> {w.feedback}</div>
              ))}
            </div>
          )}
        </section>
      )}

      {solvedPending && view?.bonusQuestion && (
        <section className="bonus" ref={bonusRef}>
          <div className="tag">✓ Correct. Root cause found · Clock stopped at {fmtClock(secs)}</div>
          <h3>Bonus, one try for +{BONUS_POINTS}: {view.bonusQuestion.question}</h3>
          <div className="options">
            {view.bonusQuestion.options.map((o, i) => (
              <button key={i} disabled={!!busy} onClick={() => answerBonus(i)} className={pickedBonus === i ? 'right' : ''}>
                <b>{String.fromCharCode(65 + i)}</b>
                <span>{o}</span>
              </button>
            ))}
          </div>
          {busy === 'bonus' && <span className="foot">Locking it in…</span>}
        </section>
      )}

      {finished && view && reveal && (
        <section id="verdict" ref={verdictRef}>
          <Verdict
            view={view}
            ranked={ranked}
            par={pc.par}
            final={ranked ? final : null}
            reveal={reveal}
            bonusPick={pickedBonus}
            onCopy={copyShare}
            onShare={nativeShare}
            copied={copied}
            onPractice={startPractice}
            nextIn={fmtCountdown(msToIstMidnight(serverNow))}
          />
        </section>
      )}

      {sheet && <SignIn startAt={sheet} onDone={onSignedIn} onClose={() => { setSheet(null); pending.current = null; }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function Verdict(p: {
  view: PlayerView;
  ranked: boolean;
  par: number;
  final: ResultPayload | null;
  reveal: NonNullable<PlayerView['reveal']>;
  bonusPick: number | null;
  onCopy: (s: string) => void;
  onShare: (s: string) => void;
  copied: string;
  onPractice: () => void;
  nextIn: string;
}) {
  const { view, reveal, final } = p;
  const n = view.opened.length;
  const w = view.wrong.length;
  const secs = view.elapsedSeconds ?? 0;
  const solved = !!view.solved;
  const score = view.score ?? computeScore({ files: n, wrong: w, seconds: secs, solved, bonusCorrect: !!view.bonusCorrect });
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const ex = reveal.explanation;
  const bonusAnswer = reveal.bonus.answer_index;

  return (
    <div className="verdict">
      <div className={'stampmark' + (solved ? ' solved' : '')}>{solved ? 'Case closed' : 'Case cold'}</div>
      <div>
        <div className="tag">{p.ranked ? "Today's ranked case" : 'Practice replay'}</div>
        <div className="pts">{score}<small>POINTS</small></div>
        {p.ranked && final?.rank && (
          <div className="rankline"><b>#{final.rank}</b> of {final.total.toLocaleString('en-IN')} today</div>
        )}
      </div>
      <div className="breakdown">
        <div><span>Files opened</span>{n} × {CARD_COST} = −{n * CARD_COST}</div>
        <div><span>Wrong accusations</span>{w} × {WRONG_COST} = −{w * WRONG_COST}</div>
        <div><span>Time</span>{fmtClock(secs)} = −{timePenalty(secs)}</div>
        <div><span>Bonus</span>{solved ? (view.bonusCorrect ? `+${BONUS_POINTS}` : 'missed') : '—'}</div>
        <div><span>Vs par</span>{n} files, {parText(n, p.par)}</div>
      </div>

      {solved && (
        <div className="explain">
          <p><b>Bonus: {reveal.bonus.question}</b></p>
          <div className="options">
            {reveal.bonus.options.map((o, i) => (
              <button key={i} disabled className={i === bonusAnswer ? 'right' : p.bonusPick === i ? 'wrongpick' : ''}>
                <b>{String.fromCharCode(65 + i)}</b><span>{o}</span>
              </button>
            ))}
          </div>
          <p>{reveal.bonus.explanation}</p>
        </div>
      )}

      <div className="explain">
        <p><b>The answer: {ex.answer}</b> {ex.why[0] && <Rich text={ex.why[0]} />}</p>
        {ex.why.slice(1).map((t, i) => <p key={i}><Rich text={t} /></p>)}
        <p><b>The fastest path (par {p.par}):</b></p>
        <ol>{ex.fastest_path.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ol>
        <p><b>The traps:</b> <Rich text={ex.traps} /></p>
        <p><b>The fix the CEO should take to the meeting:</b> <Rich text={ex.fix} /></p>
      </div>

      {p.ranked && final && (
        <>
          <pre className="share">{final.share}</pre>
          <div className="accuse-row">
            <button className="btn primary" onClick={() => p.onCopy(final.share)}>Copy result</button>
            {canShare && <button className="btn ink" onClick={() => p.onShare(final.share)}>Share</button>}
            <button className="btn ghost" onClick={p.onPractice}>Replay for practice</button>
            <span className="copied">{p.copied}</span>
          </div>
          <LeaderPreview final={final} />
          <p className="foot">Next case in {p.nextIn} (midnight IST).</p>
        </>
      )}
      {!p.ranked && (
        <div className="accuse-row">
          <button className="btn ghost" onClick={p.onPractice}>Replay again</button>
        </div>
      )}
    </div>
  );
}

function LeaderPreview({ final }: { final: ResultPayload }) {
  const meInTop = final.me && final.preview.some((r) => r.rank === final.me!.rank && r.username === final.me!.username);
  return (
    <div className="explain" style={{ maxWidth: 'none' }}>
      <h2>Today&apos;s leaderboard <span><Link href="/leaderboard">See all →</Link></span></h2>
      <div className="tbl">
        <table>
          <tbody>
            {final.preview.map((r, i) => (
              <tr key={i} className={final.me && r.username === final.me.username ? 'me' : ''} style={final.me && r.username === final.me.username ? { background: 'var(--hl)' } : undefined}>
                <td>#{r.rank} {r.username}</td>
                <td>{r.score} pts</td>
                <td>{fmtClock(r.elapsed_seconds)}</td>
              </tr>
            ))}
            {final.me && !meInTop && (
              <tr style={{ background: 'var(--hl)' }}>
                <td>#{final.me.rank} {final.me.username} (you)</td>
                <td>{final.me.score} pts</td>
                <td>{fmtClock(final.me.elapsed_seconds)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
