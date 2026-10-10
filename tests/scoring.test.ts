import { describe, expect, it } from 'vitest';
import { applyAccuse, applyBonus, applyOpen, computeScore, emptyAttempt, GameError, shareText, timePenalty, type StoredCase } from '@/lib/game';
import kettle from '../cases/001-kettle-co.json';

const c = { ...(kettle as unknown as StoredCase), id: 1, publish_date: '2026-10-11' };
const t = (s: number) => new Date(Date.UTC(2026, 9, 11, 4, 0, s)).toISOString();

describe('score formula (§4)', () => {
  it('starts at 1000 with nothing spent', () => {
    expect(computeScore({ files: 0, wrong: 0, seconds: 0, solved: true, bonusCorrect: false })).toBe(1000);
  });
  it('charges 75 per file, 250 per wrong accusation, 1 per 3 seconds', () => {
    expect(computeScore({ files: 2, wrong: 1, seconds: 100, solved: true, bonusCorrect: false })).toBe(1000 - 150 - 250 - 33);
  });
  it('caps the time penalty at 150', () => {
    expect(timePenalty(10_000)).toBe(150);
    expect(computeScore({ files: 0, wrong: 0, seconds: 10_000, solved: true, bonusCorrect: false })).toBe(850);
  });
  it('adds +150 bonus on top of the floored base', () => {
    expect(computeScore({ files: 8, wrong: 2, seconds: 9999, solved: true, bonusCorrect: true })).toBe(0 + 150);
    expect(computeScore({ files: 2, wrong: 0, seconds: 30, solved: true, bonusCorrect: true })).toBe(1000 - 150 - 10 + 150);
  });
  it('is 0 when unsolved, bonus or not', () => {
    expect(computeScore({ files: 1, wrong: 3, seconds: 5, solved: false, bonusCorrect: true })).toBe(0);
  });
});

describe('game transitions', () => {
  it('starts the clock on the first file and returns only that body', () => {
    const { attempt, body } = applyOpen(emptyAttempt(), c, 0, t(0));
    expect(attempt.started_at).toBe(t(0));
    expect(attempt.opened).toEqual([0]);
    expect(body).toEqual(c.evidence[0].body);
    const again = applyOpen(attempt, c, 0, t(10));
    expect(again.attempt.opened).toEqual([0]);
    expect(again.attempt.started_at).toBe(t(0));
  });

  it('starts the clock on an accusation if no file was opened', () => {
    const { attempt } = applyAccuse(emptyAttempt(), c, 0, t(5));
    expect(attempt.started_at).toBe(t(5));
  });

  it('plays the par path and scores it', () => {
    let a = applyOpen(emptyAttempt(), c, 0, t(0)).attempt;
    a = applyOpen(a, c, 2, t(20)).attempt;
    const acc = applyAccuse(a, c, c.answer_index, t(45));
    expect(acc.out.result).toBe('correct');
    if (acc.out.result === 'correct') expect(acc.out.bonus).not.toHaveProperty('answer_index');
    // time on the bonus question is free: finished at 300s, clock stopped at 45s
    const b = applyBonus(acc.attempt, c, c.bonus.answer_index, t(300));
    expect(b.bonusCorrect).toBe(true);
    expect(b.attempt.elapsed_seconds).toBe(45);
    expect(b.attempt.score).toBe(1000 - 150 - 15 + 150);
    expect(b.attempt.finished_at).toBe(t(300));
  });

  it('ends the case at 0 after three wrong accusations', () => {
    let a = emptyAttempt();
    a = applyAccuse(a, c, 0, t(1)).attempt;
    a = applyAccuse(a, c, 1, t(2)).attempt;
    const last = applyAccuse(a, c, 2, t(30));
    expect(last.out.result).toBe('unsolved');
    expect(last.attempt.score).toBe(0);
    expect(last.attempt.finished_at).not.toBeNull();
    expect(() => applyOpen(last.attempt, c, 3, t(40))).toThrow(GameError);
  });

  it('rejects repeating a ruled-out cause, and bonus before solving', () => {
    const a = applyAccuse(emptyAttempt(), c, 0, t(1)).attempt;
    expect(() => applyAccuse(a, c, 0, t(2))).toThrow(/ruled/);
    expect(() => applyBonus(a, c, 1, t(3))).toThrow(GameError);
  });

  it('allows the bonus only once', () => {
    const solved = applyAccuse(emptyAttempt(), c, c.answer_index, t(30)).attempt;
    const done = applyBonus(solved, c, 0, t(40)).attempt;
    expect(() => applyBonus(done, c, 1, t(41))).toThrow(GameError);
  });

  it('blocks opening files after solving', () => {
    const solved = applyAccuse(emptyAttempt(), c, c.answer_index, t(30)).attempt;
    expect(() => applyOpen(solved, c, 1, t(31))).toThrow(GameError);
  });

  it('flags attempts finished in under 20 seconds', () => {
    const solved = applyAccuse(emptyAttempt(), c, c.answer_index, t(10)).attempt;
    expect(applyBonus(solved, c, 0, t(12)).attempt.flagged).toBe(true);
  });
});

describe('share text', () => {
  it('matches the spec format and never names the answer', () => {
    const s = shareText({ caseNumber: 12, company: 'Kettle & Co', fileCount: 8, opened: [0, 2], wrong: 1, solved: true, bonusCorrect: true, score: 655, rank: 14, seconds: 102, par: 2, site: 'rootcause.in' });
    expect(s).toBe('Root Cause #12 🕵️ Kettle & Co\n🟩⬛🟩⬛⬛⬛⬛⬛\n❌✅ +bonus · 655 pts · #14 today\n2 files (par) · 1:42\nrootcause.in');
    expect(s).not.toMatch(/delivery/i);
  });
});
