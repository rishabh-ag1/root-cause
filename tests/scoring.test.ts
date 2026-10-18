import { describe, expect, it } from 'vitest';
import { applyAccuse, applyBonus, applyOpen, computeScore, emptyAttempt, GameError, playerView, shareText, timePenalty, type StoredCase } from '@/lib/game';
import raw from '../cases/001-saltwater-labs.json';

const c = { ...(raw as unknown as StoredCase), id: 1, publish_date: '2026-10-11' };
const t = (s: number) => new Date(Date.UTC(2026, 9, 11, 4, 0, s)).toISOString();
const WRONG = [0, 1, 2]; // three wrong causes

describe('score formula', () => {
  it('starts at 1000 with nothing spent', () => {
    expect(computeScore({ files: 0, wrong: 0, seconds: 0, solved: true })).toBe(1000);
  });
  it('charges 75 per file, 250 per wrong accusation, 1 per 3 seconds', () => {
    expect(computeScore({ files: 2, wrong: 1, seconds: 100, solved: true })).toBe(1000 - 150 - 250 - 33);
  });
  it('caps the time penalty at 150', () => {
    expect(timePenalty(10_000)).toBe(150);
    expect(computeScore({ files: 0, wrong: 0, seconds: 10_000, solved: true })).toBe(850);
  });
  it('never goes below 0', () => {
    expect(computeScore({ files: 12, wrong: 2, seconds: 9999, solved: true })).toBe(0);
  });
  it('is 0 when unsolved', () => {
    expect(computeScore({ files: 1, wrong: 3, seconds: 5, solved: false })).toBe(0);
  });
});

describe('game transitions', () => {
  it('starts the clock on the first file and returns only that body', () => {
    const { attempt, body } = applyOpen(emptyAttempt(), c, 5, t(0));
    expect(attempt.started_at).toBe(t(0));
    expect(attempt.opened).toEqual([5]);
    expect(body).toEqual(c.evidence[5].body);
    const again = applyOpen(attempt, c, 5, t(10));
    expect(again.attempt.opened).toEqual([5]);
    expect(again.attempt.started_at).toBe(t(0));
  });

  it('starts the clock on an accusation if no file was opened', () => {
    const { attempt } = applyAccuse(emptyAttempt(), c, WRONG[0], t(5));
    expect(attempt.started_at).toBe(t(5));
  });

  it('a correct accusation finishes the attempt and locks the score', () => {
    let a = applyOpen(emptyAttempt(), c, 5, t(0)).attempt;
    a = applyOpen(a, c, 10, t(20)).attempt;
    const acc = applyAccuse(a, c, c.answer_index, t(45));
    expect(acc.out.result).toBe('correct');
    if (acc.out.result === 'correct') expect(acc.out.bonus).not.toHaveProperty('answer_index');
    expect(acc.attempt.finished_at).toBe(t(45));
    expect(acc.attempt.elapsed_seconds).toBe(45);
    expect(acc.attempt.score).toBe(1000 - 150 - 15);
  });

  it('the bonus question never changes the score, right or wrong', () => {
    const solved = applyAccuse(emptyAttempt(), c, c.answer_index, t(30)).attempt;
    const right = applyBonus(solved, c, c.bonus.answer_index);
    const wrong = applyBonus(solved, c, (c.bonus.answer_index + 1) % 4);
    expect(right.bonusCorrect).toBe(true);
    expect(wrong.bonusCorrect).toBe(false);
    expect(right.attempt.score).toBe(solved.score);
    expect(wrong.attempt.score).toBe(solved.score);
    expect(right.attempt.finished_at).toBe(solved.finished_at);
  });

  it('allows the bonus only once, and only after solving', () => {
    const solved = applyAccuse(emptyAttempt(), c, c.answer_index, t(30)).attempt;
    const done = applyBonus(solved, c, 0).attempt;
    expect(() => applyBonus(done, c, 1)).toThrow(GameError);
    const notSolved = applyAccuse(emptyAttempt(), c, WRONG[0], t(1)).attempt;
    expect(() => applyBonus(notSolved, c, 1)).toThrow(GameError);
  });

  it('ends the case at 0 after three wrong accusations', () => {
    let a = emptyAttempt();
    a = applyAccuse(a, c, WRONG[0], t(1)).attempt;
    a = applyAccuse(a, c, WRONG[1], t(2)).attempt;
    const last = applyAccuse(a, c, WRONG[2], t(30));
    expect(last.out.result).toBe('unsolved');
    expect(last.attempt.score).toBe(0);
    expect(last.attempt.finished_at).not.toBeNull();
    expect(() => applyOpen(last.attempt, c, 3, t(40))).toThrow(GameError);
  });

  it('rejects repeating a ruled-out cause', () => {
    const a = applyAccuse(emptyAttempt(), c, WRONG[0], t(1)).attempt;
    expect(() => applyAccuse(a, c, WRONG[0], t(2))).toThrow(/ruled/);
  });

  it('blocks opening files and accusing after solving', () => {
    const solved = applyAccuse(emptyAttempt(), c, c.answer_index, t(30)).attempt;
    expect(() => applyOpen(solved, c, 1, t(31))).toThrow(GameError);
    expect(() => applyAccuse(solved, c, 0, t(31))).toThrow(GameError);
  });

  it('flags attempts finished in under 20 seconds', () => {
    expect(applyAccuse(emptyAttempt(), c, c.answer_index, t(10)).attempt.flagged).toBe(true);
  });

  it('withholds the bonus answer until the bonus is answered', () => {
    const solved = applyAccuse(emptyAttempt(), c, c.answer_index, t(30)).attempt;
    const v = playerView(solved, c);
    expect(v.bonusQuestion).toEqual({ question: c.bonus.question, options: c.bonus.options });
    expect(v.reveal?.bonus).toBeNull();
    expect(JSON.stringify(v)).not.toContain(c.bonus.explanation);
    const after = playerView(applyBonus(solved, c, 0).attempt, c);
    expect(after.bonusQuestion).toBeNull();
    expect(after.reveal?.bonus?.answer_index).toBe(c.bonus.answer_index);
  });
});

describe('share text', () => {
  it('matches the format and never names the answer', () => {
    const s = shareText({ caseNumber: 12, company: 'Saltwater Labs', fileCount: 12, opened: [5, 10], wrong: 1, solved: true, bonusCorrect: true, score: 655, rank: 14, seconds: 102, par: 2, site: 'rootcause.in/?c=sherlock' });
    expect(s).toBe('Root Cause #12 🕵️ Saltwater Labs\n⬛⬛⬛⬛⬛🟩⬛⬛⬛⬛🟩⬛\n❌✅ ⭐ · 655 pts · #14 today\n2 files (par) · 1:42\nCan you beat me? rootcause.in/?c=sherlock');
    expect(s).not.toMatch(/receivable|quick|60 days/i);
  });
});
