import { describe, expect, it } from 'vitest';
import { computePlayerStats, titleFor } from '@/lib/playerStats';

const cases = [1, 2, 3, 4].map((id) => ({ id, publish_date: `2026-10-1${id}`, skills: id === 2 ? ['Pricing'] : ['Cash flow'] }));
const done = (case_id: number, score = 700, solved = true) => ({ case_id, finished_at: 'x', solved, score });

describe('player stats', () => {
  it('counts a streak back from the latest case', () => {
    const s = computePlayerStats(cases, [done(2), done(3), done(4)], 4);
    expect(s).toMatchObject({ streak: 3, bestStreak: 3, played: 3, solved: 3, totalPoints: 2100, playedToday: true });
  });
  it("keeps the streak alive when today's case isn't played yet", () => {
    expect(computePlayerStats(cases, [done(2), done(3)], 4).streak).toBe(2);
  });
  it('breaks the streak after a missed case', () => {
    const s = computePlayerStats(cases, [done(1), done(2), done(4)], 4);
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });
  it('collects skills from solved cases only and ignores unsolved points', () => {
    const s = computePlayerStats(cases, [done(1), done(2, 0, false), done(3)], 4);
    expect(s.skills).toEqual([{ name: 'Cash flow', count: 2 }]);
    expect(s.totalPoints).toBe(1400);
  });
  it('climbs the career ladder', () => {
    expect(titleFor(0)).toMatchObject({ title: 'Intern', next: 'Analyst', toNext: 1500, progress: 0 });
    expect(titleFor(4000)).toMatchObject({ title: 'Associate', next: 'Manager' });
    expect(titleFor(30000)).toMatchObject({ title: 'Partner', next: null, progress: 100 });
  });
});
