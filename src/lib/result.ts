import 'server-only';
import { caseLeaderboard } from './repo';
import { shareText, type Attempt, type StoredCase } from './game';

const siteHostname = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://playrootcause.vercel.app').replace(/^https?:\/\//, '').replace(/\/$/, '');

/** The link at the end of the share text: opens today's case with "can you beat @username?". */
export function challengeLink(username: string | null) {
  return `${siteHostname()}/?${username ? `c=${encodeURIComponent(username)}&` : ''}utm_source=share`;
}

/** Rank, percentile, neighbours, share text and leaderboard preview for a finished attempt. */
export async function resultPayload(c: StoredCase, a: Attempt, userId: string) {
  const board = await caseLeaderboard(c.id, userId);
  const me = board.me;
  const rank = me?.rank ?? null;
  // "You beat X% of players": share of other finishers ranked below you.
  const percentile = me && board.total > 1 ? Math.round(((board.total - me.rank) / (board.total - 1)) * 100) : null;
  const above = me ? [...board.around, ...board.top].filter((r) => r.rank < me.rank).sort((x, y) => y.rank - x.rank)[0] ?? null : null;
  return {
    rank,
    total: board.total,
    percentile,
    ahead: above && me ? { username: above.username, gap: Math.max(0, above.score - me.score) } : null,
    around: board.around,
    share: shareText({
      caseNumber: c.case_number,
      company: c.company,
      fileCount: c.evidence.length,
      opened: a.opened,
      wrong: a.wrong.length,
      solved: !!a.solved,
      bonusCorrect: !!a.bonus_correct,
      score: a.score ?? 0,
      rank,
      seconds: a.elapsed_seconds ?? 0,
      par: c.par,
      site: challengeLink(me?.username ?? null),
    }),
    preview: board.top.slice(0, 10),
    me,
  };
}

export type ResultPayload = Awaited<ReturnType<typeof resultPayload>>;
