import { json, fail, handleError } from '@/lib/api';
import { getChallenge, getTodayCase } from '@/lib/repo';
import { rateLimited } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** GET /api/challenge?u=username → that player's result on today's case (same facts as the leaderboard). */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get('u')?.trim() ?? '';
  if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) return fail(400, 'body', 'Invalid username.');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited('ch:' + ip, 60)) return fail(429, 'rate', 'Slow down a little.');
  try {
    const c = await getTodayCase();
    if (!c) return fail(404, 'no_case', 'No case today.');
    const r = await getChallenge(u, c.id);
    return r ? json(r) : fail(404, 'no_user', 'Player not found.');
  } catch (e) {
    return handleError(e);
  }
}
