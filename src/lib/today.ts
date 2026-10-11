import 'server-only';
import { currentUser } from './supabase/server';
import { getAttempt, getProfile, getTodayCase } from './repo';
import { emptyAttempt, playerView, publicCase, type PlayerView, type PublicCase } from './game';
import { resultPayload, type ResultPayload } from './result';

export type TodayPayload = {
  serverNow: string;
  case: PublicCase;
  me: { id: string; email: string | null; username: string | null } | null;
  attempt: PlayerView | null;
  final: ResultPayload | null;
};

/** Everything the Today screen needs, already stripped of anything the player hasn't earned. */
export async function todayPayload(): Promise<TodayPayload | null> {
  const c = await getTodayCase();
  if (!c) return null;
  const user = await currentUser();
  const [profile, row] = user ? await Promise.all([getProfile(user.id), getAttempt(user.id, c.id)]) : [null, null];
  const attempt = row ? { ...emptyAttempt(), ...row } : null;
  return {
    serverNow: new Date().toISOString(),
    case: publicCase(c),
    me: user ? { id: user.id, email: user.email ?? null, username: profile?.username ?? null } : null,
    attempt: attempt ? playerView(attempt, c) : null,
    final: attempt?.finished_at && user ? await resultPayload(c, attempt, user.id) : null,
  };
}
