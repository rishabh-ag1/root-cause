import type { Block, CaseFile } from './caseSchema';

export const START_POINTS = 1000;
export const CARD_COST = 75;
export const WRONG_COST = 250;
export const MAX_WRONG = 3;
export const TIME_CAP = 150;
export const SECONDS_PER_POINT = 3;
export const BONUS_POINTS = 150;
export const FLAG_UNDER_SECONDS = 20;

export function timePenalty(seconds: number) {
  return Math.min(TIME_CAP, Math.floor(Math.max(0, seconds) / SECONDS_PER_POINT));
}

/** §4: max(0, 1000 − 75·files − 250·wrong − min(150, floor(s/3))) + bonus, if solved; else 0. */
export function computeScore(p: { files: number; wrong: number; seconds: number; solved: boolean; bonusCorrect: boolean }) {
  if (!p.solved) return 0;
  const base = Math.max(0, START_POINTS - CARD_COST * p.files - WRONG_COST * p.wrong - timePenalty(p.seconds));
  return base + (p.bonusCorrect ? BONUS_POINTS : 0);
}

export function elapsedSeconds(start: string | Date | null, end: string | Date | null) {
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

/** A case as stored in the DB (the case file plus its row id and publish date). */
export type StoredCase = Omit<CaseFile, 'slug'> & { id: number; publish_date: string; slug?: string };

export type Attempt = {
  started_at: string | null;
  opened: number[];
  wrong: number[];
  solved: boolean | null;
  solved_at: string | null;
  bonus_correct: boolean | null;
  finished_at: string | null;
  score: number | null;
  elapsed_seconds: number | null;
  flagged: boolean;
};

export const emptyAttempt = (): Attempt => ({
  started_at: null,
  opened: [],
  wrong: [],
  solved: null,
  solved_at: null,
  bonus_correct: null,
  finished_at: null,
  score: null,
  elapsed_seconds: null,
  flagged: false,
});

export class GameError extends Error {
  constructor(public code: 'finished' | 'solved' | 'not_solved' | 'bad_index' | 'already_ruled', message: string) {
    super(message);
  }
}

const isFinished = (a: Attempt) => a.finished_at !== null;

// ---------------------------------------------------------------- transitions

export function applyOpen(a: Attempt, c: StoredCase, index: number, now: string) {
  if (isFinished(a)) throw new GameError('finished', 'This case is closed.');
  if (a.solved) throw new GameError('solved', 'You already cracked it. Answer the bonus question.');
  if (!Number.isInteger(index) || index < 0 || index >= c.evidence.length) throw new GameError('bad_index', 'No such file.');
  const next: Attempt = { ...a, started_at: a.started_at ?? now, opened: a.opened.includes(index) ? a.opened : [...a.opened, index] };
  return { attempt: next, body: c.evidence[index].body };
}

export type AccuseResult =
  | { result: 'wrong'; feedback: string; wrongLeft: number }
  | { result: 'unsolved'; feedback: string }
  | { result: 'correct'; bonus: { question: string; options: string[] } };

export function applyAccuse(a: Attempt, c: StoredCase, causeIndex: number, now: string): { attempt: Attempt; out: AccuseResult } {
  if (isFinished(a)) throw new GameError('finished', 'This case is closed.');
  if (a.solved) throw new GameError('solved', 'You already cracked it. Answer the bonus question.');
  if (!Number.isInteger(causeIndex) || causeIndex < 0 || causeIndex >= c.causes.length) throw new GameError('bad_index', 'No such cause.');
  if (a.wrong.includes(causeIndex)) throw new GameError('already_ruled', 'You already ruled that out.');

  const started = a.started_at ?? now;
  if (causeIndex === c.answer_index) {
    return {
      attempt: { ...a, started_at: started, solved: true, solved_at: now },
      out: { result: 'correct', bonus: { question: c.bonus.question, options: c.bonus.options } },
    };
  }
  const wrong = [...a.wrong, causeIndex];
  const feedback = c.causes[causeIndex].feedback;
  if (wrong.length >= MAX_WRONG) {
    const secs = elapsedSeconds(started, now);
    return {
      attempt: { ...a, started_at: started, wrong, solved: false, finished_at: now, score: 0, elapsed_seconds: secs, flagged: secs < FLAG_UNDER_SECONDS },
      out: { result: 'unsolved', feedback },
    };
  }
  return { attempt: { ...a, started_at: started, wrong }, out: { result: 'wrong', feedback, wrongLeft: MAX_WRONG - wrong.length } };
}

export function applyBonus(a: Attempt, c: StoredCase, optionIndex: number, now: string) {
  if (isFinished(a)) throw new GameError('finished', 'This case is closed.');
  if (!a.solved) throw new GameError('not_solved', 'Crack the case first.');
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= c.bonus.options.length) throw new GameError('bad_index', 'No such option.');
  const bonusCorrect = optionIndex === c.bonus.answer_index;
  // The clock stops at the correct accusation; time spent on the bonus question is free.
  const secs = elapsedSeconds(a.started_at, a.solved_at);
  const score = computeScore({ files: a.opened.length, wrong: a.wrong.length, seconds: secs, solved: true, bonusCorrect });
  return {
    attempt: { ...a, bonus_correct: bonusCorrect, finished_at: now, score, elapsed_seconds: secs, flagged: secs < FLAG_UNDER_SECONDS },
    bonusCorrect,
  };
}

// ---------------------------------------------------------------- views

export const fmtClock = (s: number) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

export function parText(files: number, par: number) {
  if (files === par) return 'par';
  return files < par ? `${par - files} under par` : `+${files - par} over par`;
}

export function shareText(p: {
  caseNumber: number;
  company: string;
  fileCount: number;
  opened: number[];
  wrong: number;
  solved: boolean;
  bonusCorrect: boolean;
  score: number;
  rank: number | null;
  seconds: number;
  par: number;
  site: string;
}) {
  const grid = Array.from({ length: p.fileCount }, (_, i) => (p.opened.includes(i) ? '🟩' : '⬛')).join('');
  const tries = '❌'.repeat(p.wrong) + (p.solved ? '✅' : '');
  const parts = [tries];
  if (p.solved && p.bonusCorrect) parts[0] += ' +bonus';
  parts.push(p.solved ? `${p.score} pts` : 'case unsolved');
  if (p.rank) parts.push(`#${p.rank} today`);
  return [
    `Root Cause #${p.caseNumber} 🕵️ ${p.company}`,
    grid,
    parts.join(' · '),
    `${p.opened.length} files (${parText(p.opened.length, p.par)}) · ${fmtClock(p.seconds)}`,
    p.site,
  ].join('\n');
}

/** What anyone may see before playing. No bodies, no feedback, no answers, no explanation. */
export type PublicCase = {
  id: number;
  caseNumber: number;
  publishDate: string;
  difficulty: string;
  title: string;
  company: string;
  brief: CaseFile['brief'];
  par: number;
  files: { title: string; teaser: string }[];
  causes: string[];
};

export function publicCase(c: StoredCase): PublicCase {
  return {
    id: c.id,
    caseNumber: c.case_number,
    publishDate: c.publish_date,
    difficulty: c.difficulty,
    title: c.title,
    company: c.company,
    brief: c.brief,
    par: c.par,
    files: c.evidence.map((e) => ({ title: e.title, teaser: e.teaser })),
    causes: c.causes.map((x) => x.label),
  };
}

export type Reveal = {
  answerIndex: number;
  explanation: CaseFile['explanation'];
  bonus: CaseFile['bonus'];
  /** Everything needed for a local practice replay, only sent after the ranked attempt ends. */
  practice: { bodies: Block[][]; feedback: string[] };
};

export type PlayerView = {
  startedAt: string | null;
  opened: number[];
  bodies: Record<number, Block[]>;
  wrong: { index: number; feedback: string }[];
  solved: boolean | null;
  bonusQuestion: { question: string; options: string[] } | null;
  finished: boolean;
  bonusCorrect: boolean | null;
  score: number | null;
  elapsedSeconds: number | null;
  solvedAt: string | null;
  reveal: Reveal | null;
};

/** The player's own state. Reveals only what their moves have earned. */
export function playerView(a: Attempt, c: StoredCase): PlayerView {
  const finished = a.finished_at !== null;
  const bodies: Record<number, Block[]> = {};
  for (const i of a.opened) bodies[i] = c.evidence[i].body;
  return {
    startedAt: a.started_at,
    opened: a.opened,
    bodies,
    wrong: a.wrong.map((i) => ({ index: i, feedback: c.causes[i].feedback })),
    solved: a.solved,
    bonusQuestion: a.solved && !finished ? { question: c.bonus.question, options: c.bonus.options } : null,
    finished,
    bonusCorrect: a.bonus_correct,
    score: a.score,
    elapsedSeconds: a.elapsed_seconds,
    solvedAt: a.solved_at,
    reveal: finished ? revealFor(c) : null,
  };
}

export function revealFor(c: StoredCase): Reveal {
  return {
    answerIndex: c.answer_index,
    explanation: c.explanation,
    bonus: c.bonus,
    practice: { bodies: c.evidence.map((e) => e.body), feedback: c.causes.map((x) => x.feedback) },
  };
}
