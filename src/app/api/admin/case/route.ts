import { json, fail, handleError } from '@/lib/api';
import { guardAdmin } from '@/lib/adminApi';
import { getCaseForAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** Full case content (answer included) for the admin preview. */
export async function GET(req: Request) {
  const g = await guardAdmin();
  if (g.res) return g.res;
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return fail(400, 'body', 'Missing id.');
  try {
    const c = await getCaseForAdmin(id);
    return c ? json(c) : fail(404, 'no_case', 'Case not found.');
  } catch (e) {
    return handleError(e);
  }
}
