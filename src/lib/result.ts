import 'server-only';
import { caseLeaderboard } from './repo';
import { shareText, type Attempt, type StoredCase } from './game';

const siteOrigin = () => {
  const u = (process.env.NEXT_PUBLIC_SITE_URL || 'https://playrootcause.vercel.app').trim().replace(/\/$/, '');
  return /^https?:\/\//.test(u) ? u : 'https://' + u;
};

/** The full, clickable link at the end of the share text, tagged as a referral. */
export function challengeLink(username: string | null) {
  return `${siteOrigin()}/?${username ? `c=${encodeURIComponent(username)}&` : ''}utm_source=referral`;
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
      solved: !!a.solved,
      score: a.score ?? 0,
      rank,
      total: board.total,
      seconds: a.elapsed_seconds ?? 0,
      link: challengeLink(me?.username ?? null),
    }),
    preview: board.top.slice(0, 10),
    me,
  };
}

export type ResultPayload = Awaited<ReturnType<typeof resultPayload>>;
