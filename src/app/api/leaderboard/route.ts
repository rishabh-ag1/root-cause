import { json, fail, handleError } from '@/lib/api';
import { currentUser } from '@/lib/supabase/server';
import { caseLeaderboard, getCaseByNumber, getTodayCase, weekLeaderboard } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const user = await currentUser();
    if (url.searchParams.get('range') === 'week') {
      return json({ range: 'week', ...(await weekLeaderboard(user?.id ?? null)) });
    }
    const n = Number(url.searchParams.get('case'));
    const c = Number.isInteger(n) && n > 0 ? await getCaseByNumber(n) : await getTodayCase();
    if (!c) return fail(404, 'no_case', 'Case not found.');
    const board = await caseLeaderboard(c.id, user?.id ?? null);
    return json({ range: 'case', caseNumber: c.case_number, company: c.company, par: c.par, ...board });
  } catch (e) {
    return handleError(e);
  }
}
