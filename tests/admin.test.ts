import { describe, expect, it } from 'vitest';
import { caseDay, msToNextRelease } from '@/lib/dates';
import { computeStats, type StatsInput } from '@/lib/adminStats';

const at = (iso: string) => new Date(iso);

describe('9am IST release', () => {
  it('keeps yesterday\'s case until 09:00 IST', () => {
    expect(caseDay(at('2026-10-12T03:29:00Z'))).toBe('2026-10-11'); // 08:59 IST on the 12th
    expect(caseDay(at('2026-10-12T03:30:00Z'))).toBe('2026-10-12'); // 09:00 IST
    expect(caseDay(at('2026-10-12T18:00:00Z'))).toBe('2026-10-12'); // 23:30 IST
    expect(caseDay(at('2026-10-12T19:00:00Z'))).toBe('2026-10-12'); // 00:30 IST on the 13th, still the 12th's case
  });
  it('counts down to the next 09:00 IST', () => {
    expect(msToNextRelease(at('2026-10-12T03:29:00Z').getTime())).toBe(60_000);
    expect(msToNextRelease(at('2026-10-12T03:30:00Z').getTime())).toBe(86_400_000);
  });
});

describe('admin analytics', () => {
  const now = at('2026-10-14T06:00:00Z'); // case day 2026-10-14
  const mk = (user: string, caseId: number, day: string, solved = true, opened = [0, 1]) => ({
    user_id: user,
    case_id: caseId,
    started_at: `${day}T05:00:00Z`,
    finished_at: `${day}T05:03:00Z`,
    opened,
    wrong: solved ? [] : [2, 3, 4],
    solved,
    bonus_correct: solved ? true : null,
    score: solved ? 800 : 0,
    elapsed_seconds: 180,
    flagged: false,
  });
  const caseRow = (id: number, n: number, date: string | null, status = 'scheduled') => ({
    id, case_number: n, title: 'T' + n, company: 'Co' + n, difficulty: 'easy', par: 2, publish_date: date, status,
    files: ['A', 'B', 'C'], causes: ['w0', 'w1', 'w2', 'w3', 'w4', 'right'], answer_index: 5,
  });
  const input: StatsInput = {
    now,
    users: ['u1', 'u2', 'u3', 'u4'].map((id) => ({ id, created_at: '2026-10-12T05:00:00Z' })),
    profiles: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
    attempts: [
      mk('u1', 1, '2026-10-12'), mk('u2', 1, '2026-10-12'), mk('u3', 1, '2026-10-12', false),
      mk('u1', 2, '2026-10-13'), mk('u2', 2, '2026-10-13'),
      mk('u1', 3, '2026-10-14'),
    ],
    cases: [caseRow(1, 1, '2026-10-12'), caseRow(2, 2, '2026-10-13'), caseRow(3, 3, '2026-10-14'), caseRow(4, 4, '2026-10-15'), caseRow(5, 0, null, 'draft')],
  };
  const s = computeStats(input);

  it('counts active users by case day', () => {
    expect(s.today).toBe('2026-10-14');
    expect(s.active).toMatchObject({ dau: 1, wau: 3, mau: 3 });
    expect(s.totals).toMatchObject({ signups: 4, players: 3, liveCases: 3, upcoming: 1, library: 1 });
  });
  it('measures next-case retention and streaks', () => {
    expect(s.retention.pairs).toEqual([
      { from: 1, to: 2, players: 3, returned: 2, rate: 66.7 },
      { from: 2, to: 3, players: 2, returned: 1, rate: 50 },
    ]);
    expect(s.retention.nextCaseReturn).toBe(60);
    expect(s.retention.longestStreak).toBe(3);
  });
  it('builds the funnel and per-case table without personal data', () => {
    expect(s.funnel.map((f) => f.count)).toEqual([4, 3, 3, 3, 2, 2]);
    expect(s.perCase[0].number).toBe(3);
    expect(s.perCase.find((c) => c.number === 1)).toMatchObject({ players: 3, solveRate: 66.7, avgScore: 800 });
    expect(JSON.stringify(s)).not.toMatch(/u[1-4]"/);
  });
  it('writes insights, including the small-sample warning', () => {
    expect(s.insights[0].text).toMatch(/Only 3 people/);
    expect(s.insights.some((i) => /came back for the next case/.test(i.text))).toBe(true);
  });
});
