import { json, fail, handleError } from '@/lib/api';
import { todayPayload } from '@/lib/today';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const p = await todayPayload();
    if (!p) return fail(404, 'no_case', 'No case is live yet. Check back at midnight IST.');
    return json(p);
  } catch (e) {
    return handleError(e);
  }
}
