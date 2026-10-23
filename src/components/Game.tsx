'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAccuse, applyBonus, applyOpen, CARD_COST, elapsedSeconds, emptyAttempt, fmtClock, MAX_WRONG,
  playerView, START_POINTS, timePenalty, WRONG_COST, type Attempt, type PlayerView, type StoredCase,
} from '@/lib/game';
import type { TodayPayload } from '@/lib/today';
import type { ResultPayload } from '@/lib/result';
import { msToNextRelease } from '@/lib/dates';
import { identify, tag, track } from '@/lib/track';
import { Blocks } from './Blocks';
import SignIn from './SignIn';
import Sheet from './ui/Sheet';
import HowToPlay from './game/HowToPlay';
import { useRouter } from 'next/navigation';
import { INTRO_KEY } from './landing/StartButton';
import Result, { type Challenge } from './game/Result';

type Practice = { attempt: Attempt; c: StoredCase; bonusPick: number | null };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function fmtCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

const LEVEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

export default function Game({ initial }: { initial: TodayPayload }) {
  const pc = initial.case;
  const [me, setMe] = useState(initial.me);
  const [att, setAtt] = useState<PlayerView | null>(initial.attempt);
  const [final, setFinal] = useState<ResultPayload | null>(initial.final);
  const [stats, setStats] = useState(initial.stats);
  const [offset, setOffset] = useState(() => new Date(initial.serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [signIn, setSignIn] = useState<null | 'email' | 'username'>(null);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [bonusPick, setBonusPick] = useState<number | null>(null);
  const [hitKey, setHitKey] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [expanded, setExpanded] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [lastWrong, setLastWrong] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const pending = useRef<null | { kind: 'open'; index: number } | { kind: 'accuse' }>(null);
  const answerRef = useRef<HTMLElement>(null);

  const view: PlayerView | null = practice ? playerView(practice.attempt, practice.c) : att;
  const ranked = !practice;
  const finished = !!view?.finished;
  const opened = view?.opened ?? [];
  const wrong = view?.wrong ?? [];
  const livesLeft = MAX_WRONG - wrong.length;

  // ---- first visit, analytics, challenge links
  useEffect(() => {
    tag('case', pc.caseNumber);
    tag('signed_in', !!initial.me);
    tag('played_today', !!initial.attempt?.finished);
    track('case_view', { case: pc.caseNumber, difficulty: pc.difficulty });
    try {
      // Nobody starts a case without reading how the game works first.
      if (!localStorage.getItem(INTRO_KEY) && !initial.attempt) return router.replace('/' + location.search);
    } catch {}
    const c = new URLSearchParams(location.search).get('c');
    if (c && /^[A-Za-z0-9_]{3,20}$/.test(c))
      fetch('/api/challenge?u=' + encodeURIComponent(c)).then(async (r) => r.ok && setChallenge(await r.json())).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (me?.id) identify(me.id, me.username);
  }, [me?.id, me?.username]);
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
  const secs = view?.startedAt ? view.elapsedSeconds ?? elapsedSeconds(view.startedAt, new Date(serverNow).toISOString()) : 0;
  const points = finished ? view!.score ?? 0 : Math.max(0, START_POINTS - CARD_COST * opened.length - WRONG_COST * wrong.length - timePenalty(secs));
  const nextIn = fmtCountdown(msToNextRelease(serverNow));

  const sync = useCallback((iso: string) => setOffset(new Date(iso).getTime() - Date.now()), []);
  const refresh = useCallback(async () => {
    const res = await fetch('/api/case/today', { cache: 'no-store' });
    if (!res.ok) return null;
    const p = (await res.json()) as TodayPayload;
    sync(p.serverNow);
    setMe(p.me);
    setAtt(p.attempt);
    setFinal(p.final);
    setStats(p.stats);
    return p;
  }, [sync]);

  function handleError(status: number, data: { error?: { code?: string; message?: string } }) {
    if (status === 401) {
      setMe(null);
      setSignIn('email');
      return;
    }
    if (status === 403 && data.error?.code === 'username') return setSignIn('username');
    setToast(data.error?.message ?? 'Something went wrong. Try again.');
    if (status === 409) refresh();
  }

  function needAccount(action: NonNullable<typeof pending.current>) {
    if (practice) return false;
    if (!me || !me.username) {
      pending.current = action;
      track('signin_prompt');
      setSignIn(me ? 'username' : 'email');
      return true;
    }
    return false;
  }

  async function onSignedIn(username: string) {
    setSignIn(null);
    setToast(`Welcome, ${username}`);
    const p = await refresh();
    const action = pending.current;
    pending.current = null;
    if (!p || p.attempt?.finished || !action) return;
    // Resume opening the file they tapped; never jump straight into the answer list after sign-in.
    if (action.kind === 'open') openFile(action.index, p.attempt);
  }

  function finishUp() {
    setTimeout(() => setShowResult(true), 400);
  }

  const toggle = (i: number) => setExpanded((e) => (e.includes(i) ? e.filter((x) => x !== i) : [...e, i]));
  const expand = (i: number) => setExpanded((e) => (e.includes(i) ? e : [...e, i]));

  // ---- files
  async function openFile(i: number, current: PlayerView | null = att) {
    if (view?.bodies[i]) return toggle(i);
    if (finished) return;
    if (practice) {
      const { attempt } = applyOpen(practice.attempt, practice.c, i, new Date().toISOString());
      setPractice({ ...practice, attempt });
      setHitKey((k) => k + 1);
      return expand(i);
    }
    if (needAccount({ kind: 'open', index: i })) return;
    if (current?.bodies[i]) return expand(i);
    setBusy('open' + i);
    const { ok, status, data } = await post('/api/attempt/open', { caseId: pc.id, index: i });
    setBusy(null);
    if (!ok) return handleError(status, data);
    track('file_open', { file: i + 1, title: pc.files[i].title, nth: data.opened.length, case: pc.caseNumber });
    sync(data.serverNow);
    setAtt((a) => {
      const base = a ?? playerView(emptyAttempt(), { evidence: [], causes: [] } as unknown as StoredCase);
      return { ...base, startedAt: data.startedAt, opened: data.opened, bodies: { ...base.bodies, [i]: data.body } };
    });
    setHitKey((k) => k + 1);
    expand(i);
  }

  // ---- answer (on the page: pick an option, then Submit)
  async function accuse() {
    if (picked === null || finished) return;
    if (needAccount({ kind: 'accuse' })) return;
    if (practice) {
      const { attempt, out } = applyAccuse(practice.attempt, practice.c, picked, new Date().toISOString());
      setPractice({ ...practice, attempt });
      setPicked(null);
      if (out.result === 'wrong') {
        setLastWrong(out.feedback);
        setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        setHitKey((k) => k + 1);
      } else finishUp();
      return;
    }
    setBusy('accuse');
    const { ok, status, data } = await post('/api/attempt/accuse', { caseId: pc.id, causeIndex: picked });
    setBusy(null);
    if (!ok) return handleError(status, data);
    sync(data.serverNow);
    const a = data.attempt as PlayerView;
    setAtt(a);
    setPicked(null);
    track(data.result === 'correct' ? 'case_solved' : data.result === 'unsolved' ? 'case_unsolved' : 'accuse_wrong', {
      case: pc.caseNumber, cause: picked, files: a.opened.length, wrong: a.wrong.length, seconds: a.elapsedSeconds, score: a.score, par: pc.par, under_par: a.opened.length <= pc.par,
    });
    if (data.result === 'wrong') {
      setLastWrong(data.feedback);
        setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      setHitKey((k) => k + 1);
      return;
    }
    tag('result', data.result);
    if (data.final) setFinal(data.final);
    finishUp();
    refresh(); // streak, title and rank update
  }

  // ---- bonus (for fun)
  async function answerBonus(i: number) {
    if (!view?.bonusQuestion) return;
    if (practice) {
      const { attempt } = applyBonus(practice.attempt, practice.c, i);
      return setPractice({ ...practice, attempt, bonusPick: i });
    }
    setBusy('bonus');
    setBonusPick(i);
    const { ok, status, data } = await post('/api/attempt/bonus', { caseId: pc.id, optionIndex: i });
    setBusy(null);
    if (!ok) {
      setBonusPick(null);
      return handleError(status, data);
    }
    track(data.bonusCorrect ? 'bonus_correct' : 'bonus_wrong', { case: pc.caseNumber });
    setAtt(data.attempt);
    setFinal(data.final);
  }

  function startPractice() {
    const reveal = att?.reveal;
    if (!reveal?.bonus) return;
    track('practice_start', { case: pc.caseNumber });
    const c: StoredCase = {
      id: pc.id, case_number: pc.caseNumber, publish_date: pc.publishDate, difficulty: pc.difficulty as StoredCase['difficulty'],
      title: pc.title, company: pc.company, brief: pc.brief, par: pc.par, status: 'live', skills: pc.skills,
      evidence: pc.files.map((f, i) => ({ ...f, body: reveal.practice.bodies[i] })),
      causes: pc.causes.map((label, i) => ({ label, feedback: reveal.practice.feedback[i] })),
      answer_index: reveal.answerIndex, bonus: reveal.bonus, explanation: reveal.explanation,
    };
    setShowResult(false);
    setPractice({ attempt: emptyAttempt(), c, bonusPick: null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function share(via: 'whatsapp' | 'native' | 'copy', text: string) {
    track('share_' + via, { case: pc.caseNumber });
    if (via === 'whatsapp') return void window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    if (via === 'native') {
      try {
        await navigator.share({ text });
      } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied('Copied!');
    } catch {
      setCopied('Copy failed');
    }
    setTimeout(() => setCopied(''), 2500);
  }

  const dateTxt = useMemo(
    () => new Date(pc.publishDate + 'T00:00:00+05:30').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }),
    [pc.publishDate],
  );
  const reveal = view?.reveal ?? null;
  const pickedBonus = practice ? practice.bonusPick : bonusPick;

  return (
    <main className="wrap game">
      {/* ---- score bar */}
      <div className="bar" role="status" aria-label="Score">
        <span key={hitKey} className={'bar-pts' + (hitKey ? ' hit' : '')}>{points}<small>pts</small></span>
        <span className="bar-meta">
          <span>{opened.length}/{pc.files.length} files</span>
          <span aria-label={`${livesLeft} guesses left`}>{livesLeft} guess{livesLeft === 1 ? '' : 'es'}</span>
          <span className="mono">{fmtClock(secs)}</span>
        </span>
      </div>

      {practice && (
        <div className="note">
          <span>Practice run. It doesn&apos;t count.</span>
          <button className="textbtn" onClick={() => { setPractice(null); window.scrollTo({ top: 0 }); }}>Exit</button>
        </div>
      )}

      {ranked && challenge && (
        <div className="note accent">
          <span>
            <b>@{challenge.username}</b>{' '}
            {challenge.finished ? (challenge.solved ? <>scored {challenge.score} today. Can you beat that?</> : <>couldn&apos;t crack today&apos;s case. Can you?</>) : <>challenged you to today&apos;s case.</>}
          </span>
        </div>
      )}

      {ranked && finished && att && (
        <button className="note link" onClick={() => setShowResult(true)}>
          <span><b>{att.solved ? `${att.score} points` : 'Unsolved'}</b>{final?.rank ? ` · #${final.rank} of ${final.total}` : ''}{stats && stats.streak > 0 ? ` · ${stats.streak}-day streak` : ''}</span>
          <span className="textbtn">Results</span>
        </button>
      )}

      {/* ---- brief */}
      <article className="case">
        <p className="case-meta">Case {pc.caseNumber} · {dateTxt} · {LEVEL[pc.difficulty] ?? pc.difficulty}</p>
        <p className="company">{pc.company}</p>
        <h1>{pc.brief.headline}</h1>
        <p className="story open">{pc.brief.story}</p>
        <dl className="facts">
          {pc.brief.facts.map((f, i) => (
            <div key={i} className={f.tone === 'down' ? 'down' : ''}><dt>{f.label}</dt><dd>{f.value}</dd></div>
          ))}
        </dl>
        <button className="textbtn muted" onClick={() => setHelp(true)}>How to play</button>
      </article>

      {/* ---- evidence: files open in place */}
      <section className="files">
        <div className="section-head">
          <h2>Evidence</h2>
          <span className="muted small">Each file costs {CARD_COST} points</span>
        </div>
        <ul className="file-list">
          {pc.files.map((f, i) => {
            const body = view?.bodies[i];
            const isOpen = expanded.includes(i);
            const isBusy = busy === 'open' + i;
            return (
              <li key={i} className={body ? 'has-body' : ''}>
                <button className={'file-row' + (body ? ' opened' : '')} aria-expanded={!!body && isOpen} disabled={(!body && finished) || isBusy} onClick={() => openFile(i)}>
                  <span className="file-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <span className="file-text"><b>{f.title}</b><span>{f.teaser}</span></span>
                  <span className="file-cta">{isBusy ? 'Opening…' : body ? (isOpen ? 'Hide' : 'Show') : finished ? '' : `Open · −${CARD_COST}`}</span>
                </button>
                {body && isOpen && (
                  <div className="file-body">
                    {pc.brief.units_note && <p className="muted small">{pc.brief.units_note}</p>}
                    <Blocks blocks={body} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---- the answer, on the same page */}
      <section className="answer" ref={answerRef}>
        <div className="section-head">
          <h2>{finished ? 'The answer' : "What's the root cause?"}</h2>
          {!finished && <span className="muted small">{livesLeft} guess{livesLeft === 1 ? '' : 'es'} left</span>}
        </div>
        {!finished && <p className="muted small answer-help">Pick the one reason that best explains the problem. A wrong answer costs {WRONG_COST} points.</p>}
        {!finished && lastWrong !== null && (
          <div className="fb" key={wrong.length} role="alert"><b>Not quite.</b> {lastWrong}</div>
        )}
        <div className="cause-list" role="radiogroup" aria-label="Possible root causes">
          {pc.causes.map((label, i) => {
            const ruled = wrong.some((w) => w.index === i);
            const isAnswer = finished && reveal?.answerIndex === i;
            return (
              <button
                key={i}
                role="radio"
                aria-checked={picked === i}
                disabled={ruled || finished}
                className={'cause' + (picked === i ? ' on' : '') + (ruled ? ' ruled' : '') + (isAnswer ? ' right' : '')}
                onClick={() => setPicked(picked === i ? null : i)}
              >
                <span className="box" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        {finished && (
          <button className="btn primary block" onClick={() => setShowResult(true)}>See your results</button>
        )}
      </section>

      {/* ---- Submit appears only once something is picked */}
      {!finished && picked !== null && (
        <div className="cta-bar">
          <button className="btn primary block" disabled={busy === 'accuse'} onClick={accuse}>
            {busy === 'accuse' ? 'Checking…' : 'Submit answer'}
          </button>
        </div>
      )}

      {/* ---- result */}
      <Sheet open={showResult && finished && !!view && !!reveal} onClose={() => setShowResult(false)} size="full" className="result-sheet">
        {view && reveal && (
          <Result
            view={view}
            ranked={ranked}
            par={pc.par}
            caseNumber={pc.caseNumber}
            skills={pc.skills}
            final={ranked ? final : null}
            stats={ranked ? stats : null}
            challenge={challenge}
            bonusPick={pickedBonus}
            bonusBusy={busy === 'bonus'}
            onBonus={answerBonus}
            onShare={share}
            copied={copied}
            onPractice={startPractice}
            nextIn={nextIn}
          />
        )}
      </Sheet>

      <HowToPlay open={help} onClose={() => setHelp(false)} />
      {signIn && <SignIn startAt={signIn} onDone={onSignedIn} onClose={() => { setSignIn(null); pending.current = null; }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
