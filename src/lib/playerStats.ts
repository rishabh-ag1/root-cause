/** A career ladder from lifetime points: a reason to keep coming back. */
export const TITLES = [
  { name: 'Intern', at: 0 },
  { name: 'Analyst', at: 1500 },
  { name: 'Associate', at: 4000 },
  { name: 'Manager', at: 8000 },
  { name: 'Director', at: 15000 },
  { name: 'Partner', at: 25000 },
] as const;

export function titleFor(points: number) {
  let i = 0;
  while (i + 1 < TITLES.length && points >= TITLES[i + 1].at) i++;
  const cur = TITLES[i];
  const next = TITLES[i + 1] ?? null;
  return {
    title: cur.name,
    next: next?.name ?? null,
    toNext: next ? next.at - points : 0,
    progress: next ? Math.round(((points - cur.at) / (next.at - cur.at)) * 100) : 100,
  };
}

export type StatsCase = { id: number; publish_date: string; skills: string[] };
export type StatsAttempt = { case_id: number; finished_at: string | null; solved: boolean | null; score: number | null };

/**
 * Streak = consecutive live cases finished, counting back from the latest one.
 * If today's case isn't played yet, the streak is still alive from yesterday.
 */
export function computePlayerStats(liveCases: StatsCase[], attempts: StatsAttempt[], todayCaseId: number | null) {
  const cases = [...liveCases].sort((a, b) => a.publish_date.localeCompare(b.publish_date));
  const done = new Map(attempts.filter((a) => a.finished_at).map((a) => [a.case_id, a]));
  const played = done.size;
  const solvedList = [...done.values()].filter((a) => a.solved);
  const totalPoints = solvedList.reduce((s, a) => s + (a.score ?? 0), 0);

  let streak = 0;
  for (let i = cases.length - 1; i >= 0; i--) {
    if (done.has(cases[i].id)) streak++;
    else if (cases[i].id === todayCaseId && i === cases.length - 1) continue;
    else break;
  }
  let best = 0;
  let run = 0;
  for (const c of cases) {
    run = done.has(c.id) ? run + 1 : 0;
    best = Math.max(best, run);
  }

  const skills = new Map<string, number>();
  for (const c of cases) if (done.get(c.id)?.solved) for (const s of c.skills ?? []) skills.set(s, (skills.get(s) ?? 0) + 1);

  return {
    played,
    solved: solvedList.length,
    totalPoints,
    bestScore: solvedList.reduce((m, a) => Math.max(m, a.score ?? 0), 0),
    avgScore: solvedList.length ? Math.round(totalPoints / solvedList.length) : 0,
    streak,
    bestStreak: best,
    playedToday: todayCaseId !== null && done.has(todayCaseId),
    skills: [...skills.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    ...titleFor(totalPoints),
  };
}

export type PlayerStats = ReturnType<typeof computePlayerStats>;
