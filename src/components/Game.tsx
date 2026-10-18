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
const HOWTO_KEY = 'rc-howto-seen';

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
  const [viewing, setViewing] = useState<number | null>(null);
  const [accusing, setAccusing] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [lastWrong, setLastWrong] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const pending = useRef<null | { kind: 'open'; index: number } | { kind: 'accuse' }>(null);

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
      if (!localStorage.getItem(HOWTO_KEY) && !initial.attempt) setHowTo(true);
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

  function closeHowTo() {
    setHowTo(false);
    try {
      localStorage.setItem(HOWTO_KEY, '1');
    } catch {}
  }

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
    if (action.kind === 'open') openFile(action.index, p.attempt);
    else setAccusing(true);
  }

  function finishUp() {
    setAccusing(false);
    setViewing(null);
    setTimeout(() => setShowResult(true), 250);
  }

  // ---- files
  async function openFile(i: number, current: PlayerView | null = att) {
    if (view?.bodies[i]) return setViewing(i);
    if (finished) return;
    if (practice) {
      const { attempt } = applyOpen(practice.attempt, practice.c, i, new Date().toISOString());
      setPractice({ ...practice, attempt });
      setHitKey((k) => k + 1);
      return setViewing(i);
    }
    if (needAccount({ kind: 'open', index: i })) return;
    if (current?.bodies[i]) return setViewing(i);
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
    setViewing(i);
  }

  // ---- accuse
  function startAccuse() {
    if (finished) return setShowResult(true);
    if (needAccount({ kind: 'accuse' })) return;
    setLastWrong(null);
    setPicked(null);
    setAccusing(true);
  }

  async function accuse() {
    if (picked === null || finished) return;
    if (practice) {
      const { attempt, out } = applyAccuse(practice.attempt, practice.c, picked, new Date().toISOString());
      setPractice({ ...practice, attempt });
      setPicked(null);
      if (out.result === 'wrong') {
        setLastWrong(out.feedback);
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
  const viewingBody = viewing !== null ? view?.bodies[viewing] : null;

  return (
    <main className="wrap game">
      {/* ---- HUD */}
      <div className="hud2" role="status" aria-label="Score">
        <div className="hud2-cell"><span className="k">Points</span><span key={hitKey} className={'v big' + (hitKey ? ' hit' : '')}>{points}</span></div>
        <div className="hud2-cell"><span className="k">Files</span><span className="v">{opened.length}<small>/{pc.files.length}</small></span></div>
        <div className="hud2-cell"><span className="k">Guesses</span><span className="v lives" aria-label={`${livesLeft} guesses left`}>{'●'.repeat(livesLeft)}<i>{'●'.repeat(wrong.length)}</i></span></div>
        <div className="hud2-cell"><span className="k">Clock</span><span className="v">{fmtClock(secs)}</span></div>
      </div>

      {practice && (
        <div className="banner warn">
          <span><b>Practice run.</b> Doesn&apos;t count.</span>
          <button className="btn ghost small" onClick={() => { setPractice(null); window.scrollTo({ top: 0 }); }}>Exit</button>
        </div>
      )}

      {ranked && challenge && (
        <div className="challenge-banner">
          ⚔️ <b>@{challenge.username}</b>{' '}
          {challenge.finished ? (challenge.solved ? <>scored <b>{challenge.score}</b> on today&apos;s case. Can you beat that?</> : <>couldn&apos;t crack today&apos;s case. Can you?</>) : <>challenged you to today&apos;s case.</>}
        </div>
      )}

      {ranked && finished && att && (
        <button className="result-strip" onClick={() => setShowResult(true)}>
          <span className={'dot ' + (att.solved ? 'good' : 'bad')} />
          <span><b>{att.solved ? `${att.score} pts` : 'Unsolved'}</b>{final?.rank ? ` · #${final.rank} of ${final.total}` : ''}{stats ? ` · 🔥 ${stats.streak}` : ''}</span>
          <span className="go">Results →</span>
        </button>
      )}

      {/* ---- brief */}
      <section className="case">
        <div className="case-meta">
          <span>Case #{pc.caseNumber} · {dateTxt}</span>
          <span className="pill">{LEVEL[pc.difficulty] ?? pc.difficulty}</span>
          {ranked && stats && stats.streak > 0 && <span className="pill flame-pill">🔥 {stats.streak}</span>}
          <button className="icon-btn" onClick={() => setHowTo(true)} aria-label="How to play">?</button>
        </div>
        <div className="company">{pc.company}</div>
        <h1>{pc.brief.headline}</h1>
        <p className={'story' + (storyOpen ? ' open' : '')}>{pc.brief.story}</p>
        {!storyOpen && <button className="linkbtn" onClick={() => setStoryOpen(true)}>Read the full brief</button>}
        <div className="facts">
          {pc.brief.facts.map((f, i) => (
            <span key={i} className={'fact' + (f.tone === 'down' ? ' down' : '')}><span>{f.label}</span><b>{f.value}</b></span>
          ))}
        </div>
        {pc.skills.length > 0 && <div className="skill-line">🧠 Builds your <b>{pc.skills.join(' & ')}</b> instinct</div>}
      </section>

      {/* ---- evidence */}
      <section className="files">
        <div className="files-head">
          <h2>Evidence</h2>
          <span className="foot">Par {pc.par} files · −{CARD_COST} each</span>
        </div>
        <ul className="file-list">
          {pc.files.map((f, i) => {
            const isOpen = !!view?.bodies[i];
            const isBusy = busy === 'open' + i;
            return (
              <li key={i}>
                <button className={'file-row' + (isOpen ? ' opened' : '')} disabled={(!isOpen && finished) || isBusy} onClick={() => openFile(i)}>
                  <span className="file-ico" aria-hidden="true">{isOpen ? '✓' : String(i + 1).padStart(2, '0')}</span>
                  <span className="file-text"><b>{f.title}</b><i>{f.teaser}</i></span>
                  <span className="file-cta">{isBusy ? '…' : isOpen ? 'View' : finished ? '' : `−${CARD_COST}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {lastWrong === null && wrong.length > 0 && !finished && (
          <p className="foot center">Ruled out: {wrong.length}. {livesLeft} guess{livesLeft === 1 ? '' : 'es'} left.</p>
        )}
      </section>

      {/* ---- sticky action */}
      <div className="cta-bar">
        {finished ? (
          <button className="btn primary block" onClick={() => setShowResult(true)}>🏆 Results & leaderboard</button>
        ) : (
          <button className="btn primary block" onClick={startAccuse} disabled={!!busy}>🎯 Name the root cause</button>
        )}
      </div>

      {/* ---- file viewer */}
      <Sheet
        open={viewing !== null && !!viewingBody}
        onClose={() => setViewing(null)}
        kicker={viewing !== null ? `File ${String(viewing + 1).padStart(2, '0')}` : ''}
        title={viewing !== null ? pc.files[viewing].title : ''}
        size="lg"
        footer={!finished && (
          <div className="sheet-actions">
            <button className="btn ghost" onClick={() => setViewing(null)}>Back to files</button>
            <button className="btn primary" onClick={() => { setViewing(null); startAccuse(); }}>I know why →</button>
          </div>
        )}
      >
        {pc.brief.units_note && <p className="foot">{pc.brief.units_note}</p>}
        {viewingBody && <Blocks blocks={viewingBody} />}
      </Sheet>

      {/* ---- accuse */}
      <Sheet
        open={accusing}
        onClose={() => setAccusing(false)}
        kicker={`${livesLeft} guess${livesLeft === 1 ? '' : 'es'} left · wrong costs ${WRONG_COST}`}
        title="What's the root cause?"
        size="lg"
        footer={
          <button className="btn primary block" disabled={picked === null || busy === 'accuse'} onClick={accuse}>
            {busy === 'accuse' ? 'Checking…' : picked === null ? 'Pick one' : 'Accuse'}
          </button>
        }
      >
        {lastWrong !== null && (
          <div className="fb" key={wrong.length}><b>Not it.</b> {lastWrong}</div>
        )}
        <div className="cause-list" role="radiogroup">
          {pc.causes.map((label, i) => {
            const ruled = wrong.some((w) => w.index === i);
            return (
              <button
                key={i}
                role="radio"
                aria-checked={picked === i}
                disabled={ruled}
                className={'cause' + (picked === i ? ' on' : '') + (ruled ? ' ruled' : '')}
                onClick={() => setPicked(i)}
              >
                <span className="box" />{label}
              </button>
            );
          })}
        </div>
        {opened.length === 0 && <p className="foot center">Tip: opening one or two files first usually beats guessing.</p>}
      </Sheet>

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

      <HowToPlay open={howTo} onClose={closeHowTo} />
      {signIn && <SignIn startAt={signIn} onDone={onSignedIn} onClose={() => { setSignIn(null); pending.current = null; }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
