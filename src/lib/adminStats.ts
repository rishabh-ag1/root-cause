import { addDays, caseDay } from './dates';

/** Raw rows the dashboard is computed from. Everything here is server-side; nothing personal is returned. */
export type StatsInput = {
  users: { id: string; created_at: string }[];
  profiles: { id: string }[];
  attempts: {
    user_id: string;
    case_id: number;
    started_at: string | null;
    finished_at: string | null;
    opened: number[];
    wrong: number[];
    solved: boolean | null;
    bonus_correct: boolean | null;
    score: number | null;
    elapsed_seconds: number | null;
    flagged: boolean;
  }[];
  cases: {
    id: number;
    case_number: number | null;
    title: string;
    company: string;
    difficulty: string;
    par: number;
    publish_date: string | null;
    status: string;
    files: string[];
    causes: string[];
    answer_index: number;
  }[];
  now?: Date;
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const dayOf = (iso: string) => caseDay(new Date(iso));

export function computeStats(input: StatsInput) {
  const now = input.now ?? new Date();
  const today = caseDay(now);
  const started = input.attempts.filter((a) => a.started_at);
  const finished = started.filter((a) => a.finished_at);
  const solved = finished.filter((a) => a.solved);
  const live = input.cases
    .filter((c) => c.status !== 'draft' && c.publish_date && c.publish_date <= today)
    .sort((a, b) => a.publish_date!.localeCompare(b.publish_date!));
  const caseById = new Map(input.cases.map((c) => [c.id, c]));

  // ---- activity by case day (days roll over at 9am IST, in step with case releases)
  const activeDays = new Map<string, Set<string>>(); // day -> users
  const firstDay = new Map<string, string>(); // user -> first active day
  for (const a of started) {
    const d = dayOf(a.started_at!);
    if (!activeDays.has(d)) activeDays.set(d, new Set());
    activeDays.get(d)!.add(a.user_id);
    if (!firstDay.has(a.user_id) || d < firstDay.get(a.user_id)!) firstDay.set(a.user_id, d);
  }
  const activeBetween = (from: string, to: string) => {
    const s = new Set<string>();
    for (const [d, us] of activeDays) if (d >= from && d <= to) us.forEach((u) => s.add(u));
    return s.size;
  };
  const signupsByDay = new Map<string, number>();
  for (const u of input.users) signupsByDay.set(dayOf(u.created_at), (signupsByDay.get(dayOf(u.created_at)) ?? 0) + 1);

  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = addDays(today, i - 29);
    const users = activeDays.get(day) ?? new Set<string>();
    const fresh = [...users].filter((u) => firstDay.get(u) === day).length;
    return { day, signups: signupsByDay.get(day) ?? 0, players: users.size, newPlayers: fresh, returning: users.size - fresh };
  });

  const dau = activeDays.get(today)?.size ?? 0;
  const wau = activeBetween(addDays(today, -6), today);
  const mau = activeBetween(addDays(today, -29), today);
  const avgDau7 = avg(daily.slice(-7).map((d) => d.players));
  const stickiness = pct(avgDau7, mau);

  // ---- retention: did players of one case come back for the next one?
  const playersOf = (caseId: number) => new Set(started.filter((a) => a.case_id === caseId).map((a) => a.user_id));
  const pairs = live.slice(1).map((next, i) => {
    const prev = live[i];
    const a = playersOf(prev.id);
    const b = playersOf(next.id);
    const back = [...a].filter((u) => b.has(u)).length;
    return { from: prev.case_number, to: next.case_number, players: a.size, returned: back, rate: pct(back, a.size) };
  });
  const pairPlayers = pairs.reduce((s, p) => s + p.players, 0);
  const nextCaseReturn = pct(pairs.reduce((s, p) => s + p.returned, 0), pairPlayers);
  const casesPerPlayer = new Map<string, number>();
  for (const a of started) casesPerPlayer.set(a.user_id, (casesPerPlayer.get(a.user_id) ?? 0) + 1);
  const players = casesPerPlayer.size;
  const repeatPlayers = [...casesPerPlayer.values()].filter((n) => n >= 2).length;

  // Current streaks: consecutive live cases played, counting back from the latest one.
  const streaks = [...casesPerPlayer.keys()]
    .map((u) => {
      let n = 0;
      for (let i = live.length - 1; i >= 0; i--) {
        if (started.some((a) => a.user_id === u && a.case_id === live[i].id)) n++;
        else if (i === live.length - 1) continue; // haven't played today's yet: streak can still be alive
        else break;
      }
      return n;
    })
    .filter((n) => n >= 2)
    .sort((a, b) => b - a);

  // ---- per case
  const perCase = live
    .map((c) => {
      const at = started.filter((a) => a.case_id === c.id);
      const fin = at.filter((a) => a.finished_at);
      const sol = fin.filter((a) => a.solved);
      const bonus = sol.filter((a) => a.bonus_correct !== null);
      return {
        id: c.id,
        number: c.case_number,
        title: c.title,
        company: c.company,
        difficulty: c.difficulty,
        date: c.publish_date!,
        par: c.par,
        players: at.length,
        finished: fin.length,
        abandoned: at.length - fin.length,
        solveRate: pct(sol.length, fin.length),
        avgScore: avg(sol.map((a) => a.score ?? 0)),
        avgFiles: avg(sol.map((a) => a.opened.length)),
        avgWrong: avg(fin.map((a) => a.wrong.length)),
        medianSeconds: median(sol.map((a) => a.elapsed_seconds ?? 0)),
        atOrUnderPar: pct(sol.filter((a) => a.opened.length <= c.par).length, sol.length),
        bonusCorrect: pct(bonus.filter((a) => a.bonus_correct).length, bonus.length),
        flagged: fin.filter((a) => a.flagged).length,
      };
    })
    .reverse();

  // ---- deep dive on the most recent case that has players
  const focusCase = live.slice().reverse().find((c) => started.some((a) => a.case_id === c.id));
  let focus = null as null | {
    number: number | null;
    title: string;
    players: number;
    files: { title: string; opened: number; rate: number; first: number }[];
    wrongCauses: { label: string; picks: number; rate: number }[];
    answer: string;
  };
  if (focusCase) {
    const at = started.filter((a) => a.case_id === focusCase.id);
    focus = {
      number: focusCase.case_number,
      title: focusCase.title,
      players: at.length,
      files: focusCase.files
        .map((title, i) => {
          const opened = at.filter((a) => a.opened.includes(i)).length;
          return { title, opened, rate: pct(opened, at.length), first: at.filter((a) => a.opened[0] === i).length };
        })
        .sort((a, b) => b.opened - a.opened),
      wrongCauses: focusCase.causes
        .map((label, i) => {
          const picks = at.filter((a) => a.wrong.includes(i)).length;
          return { label, picks, rate: pct(picks, at.length) };
        })
        .filter((w) => w.picks > 0)
        .sort((a, b) => b.picks - a.picks),
      answer: focusCase.causes[focusCase.answer_index],
    };
  }

  // ---- funnel
  const funnel = [
    { step: 'Signed up (email verified)', count: input.users.length },
    { step: 'Picked a username', count: input.profiles.length },
    { step: 'Started a case', count: players },
    { step: 'Finished a case', count: new Set(finished.map((a) => a.user_id)).size },
    { step: 'Solved a case', count: new Set(solved.map((a) => a.user_id)).size },
    { step: 'Played 2+ cases', count: repeatPlayers },
  ];

  const last7 = daily.slice(-7).reduce((s, d) => s + d.signups, 0);
  const prev7 = daily.slice(-14, -7).reduce((s, d) => s + d.signups, 0);

  const totals = {
    signups: input.users.length,
    players,
    attempts: started.length,
    finished: finished.length,
    solveRate: pct(solved.length, finished.length),
    avgScore: avg(solved.map((a) => a.score ?? 0)),
    liveCases: live.length,
    upcoming: input.cases.filter((c) => c.status !== 'draft' && c.publish_date && c.publish_date > today).length,
    library: input.cases.filter((c) => c.status === 'draft' || !c.publish_date).length,
    signupsLast7: last7,
    signupsPrev7: prev7,
  };

  return {
    today,
    totals,
    active: { dau, wau, mau, avgDau7, stickiness },
    retention: { nextCaseReturn, pairs, repeatPlayers, repeatRate: pct(repeatPlayers, players), longestStreak: streaks[0] ?? 0, playersOnStreak: streaks.length },
    daily,
    funnel,
    perCase,
    focus,
    insights: insights({ totals, players, repeatPlayers, nextCaseReturn, pairPlayers, perCase, focus, funnel, stickiness, mau, upcoming: totals.upcoming, caseById }),
  };
}

export type Stats = ReturnType<typeof computeStats>;

/** Plain-language observations, each backed by a number on the dashboard. Small samples are called out. */
function insights(s: {
  totals: { signups: number; finished: number; signupsLast7: number; signupsPrev7: number; liveCases: number };
  players: number;
  repeatPlayers: number;
  nextCaseReturn: number;
  pairPlayers: number;
  perCase: { number: number | null; title: string; players: number; solveRate: number; finished: number; atOrUnderPar: number; avgFiles: number; par: number; abandoned: number; flagged: number }[];
  focus: { number: number | null; players: number; files: { title: string; first: number; rate: number }[]; wrongCauses: { label: string; rate: number }[] } | null;
  funnel: { step: string; count: number }[];
  stickiness: number;
  mau: number;
  upcoming: number;
  caseById: Map<number, unknown>;
}) {
  const out: { tone: 'good' | 'warn' | 'info'; text: string }[] = [];
  if (s.players < 30)
    out.push({ tone: 'info', text: `Only ${s.players} people have played so far. Treat every rate below as a hint, not a verdict; aim for 100+ players before deciding anything.` });

  if (s.upcoming === 0) out.push({ tone: 'warn', text: 'No case is scheduled for tomorrow or later. Players will see the same case again until you schedule one.' });
  else if (s.upcoming < 3) out.push({ tone: 'warn', text: `Only ${s.upcoming} upcoming case${s.upcoming === 1 ? '' : 's'} scheduled. Keep at least a week ahead.` });

  if (s.pairPlayers > 0) {
    const r = s.nextCaseReturn;
    out.push({
      tone: r >= 30 ? 'good' : r >= 15 ? 'info' : 'warn',
      text: `${r}% of players came back for the next case. For a daily game, 30%+ is a strong signal, under 15% means the habit isn't forming yet.`,
    });
  } else if (s.totals.liveCases <= 1) {
    out.push({ tone: 'info', text: 'Retention needs at least two live cases. It will appear after the next release.' });
  }

  const [signed, named, startedStep] = s.funnel;
  if (signed.count > 0 && startedStep.count < signed.count) {
    const lost = signed.count - startedStep.count;
    out.push({ tone: lost / signed.count > 0.2 ? 'warn' : 'info', text: `${lost} of ${signed.count} people who signed up never opened a file${named.count < signed.count ? ` (${signed.count - named.count} never picked a username)` : ''}.` });
  }

  const g = s.totals.signupsLast7 - s.totals.signupsPrev7;
  if (s.totals.signupsLast7 + s.totals.signupsPrev7 > 0)
    out.push({ tone: g > 0 ? 'good' : g < 0 ? 'warn' : 'info', text: `${s.totals.signupsLast7} sign-ups in the last 7 days vs ${s.totals.signupsPrev7} the week before.` });

  const rated = s.perCase.filter((c) => c.finished >= 3);
  if (rated.length >= 2) {
    const hardest = [...rated].sort((a, b) => a.solveRate - b.solveRate)[0];
    const easiest = [...rated].sort((a, b) => b.solveRate - a.solveRate)[0];
    out.push({ tone: 'info', text: `Hardest so far: #${hardest.number} "${hardest.title}" (${hardest.solveRate}% solved). Easiest: #${easiest.number} (${easiest.solveRate}%).` });
  }
  for (const c of s.perCase.slice(0, 3)) {
    if (c.finished < 3) continue;
    if (c.solveRate > 90) out.push({ tone: 'warn', text: `#${c.number} was solved by ${c.solveRate}% of players: probably too easy to separate people on the leaderboard.` });
    if (c.solveRate < 35) out.push({ tone: 'warn', text: `#${c.number} was solved by only ${c.solveRate}%: check that the clue path is fair and the traps aren't misleading.` });
    if (c.avgFiles > c.par + 2) out.push({ tone: 'info', text: `Solvers of #${c.number} opened ${c.avgFiles} files on average against a par of ${c.par}; the fast path may be hard to spot.` });
    if (c.abandoned > 0) out.push({ tone: 'warn', text: `${c.abandoned} player${c.abandoned === 1 ? '' : 's'} started #${c.number} and never finished.` });
    if (c.flagged > 0) out.push({ tone: 'warn', text: `${c.flagged} finish${c.flagged === 1 ? '' : 'es'} on #${c.number} took under 20 seconds. Worth a look for answer-sharing.` });
  }

  if (s.focus && s.focus.players >= 3) {
    const trap = s.focus.wrongCauses[0];
    if (trap) out.push({ tone: 'info', text: `Most common wrong answer on #${s.focus.number}: "${trap.label}", picked by ${trap.rate}% of players.` });
    const first = [...s.focus.files].sort((a, b) => b.first - a.first)[0];
    if (first) out.push({ tone: 'info', text: `Most players start #${s.focus.number} with "${first.title}".` });
    const ignored = s.focus.files.filter((f) => f.rate === 0).map((f) => f.title);
    if (ignored.length) out.push({ tone: 'info', text: `Nobody opened: ${ignored.join(', ')}.` });
  }

  if (s.mau >= 10) out.push({ tone: s.stickiness >= 20 ? 'good' : 'info', text: `Stickiness (average daily players ÷ monthly players) is ${s.stickiness}%. Habit products aim for 20%+.` });
  return out;
}
