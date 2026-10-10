import 'server-only';
import { caseLeaderboard } from './repo';
import { shareText, type Attempt, type StoredCase } from './game';

export function siteHost() {
  const url = process.env.NEXT_PUBLIC_SITE_URL || 'https://rootcause.in';
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** Rank, share text and leaderboard preview for a finished attempt. */
export async function resultPayload(c: StoredCase, a: Attempt, userId: string) {
  const board = await caseLeaderboard(c.id, userId);
  const rank = board.me?.rank ?? null;
  return {
    rank,
    total: board.total,
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
      site: siteHost(),
    }),
    preview: board.top.slice(0, 5),
    me: board.me,
  };
}

export type ResultPayload = Awaited<ReturnType<typeof resultPayload>>;
