import { z } from 'zod';
import { json, fail, handleError, readJson } from '@/lib/api';
import { guardAdmin } from '@/lib/adminApi';
import { AdminError, scheduleCase } from '@/lib/admin';

const Body = z.object({ caseId: z.number().int(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() });

/** Schedule a case for a date, or send it back to the library with date = null. */
export async function POST(req: Request) {
  const g = await guardAdmin();
  if (g.res) return g.res;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'body', 'Invalid request.');
  try {
    await scheduleCase(parsed.data.caseId, parsed.data.date);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AdminError) return fail(409, 'schedule', e.message);
    return handleError(e);
  }
}
