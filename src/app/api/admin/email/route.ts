import { z } from 'zod';
import { json, fail, handleError, readJson } from '@/lib/api';
import { guardAdmin } from '@/lib/adminApi';
import { sendNewCaseEmails } from '@/lib/release';

export const maxDuration = 60;

const Body = z.object({ caseId: z.number().int() });

/** Manually send the "case is live" email for a live case (once per case). */
export async function POST(req: Request) {
  const g = await guardAdmin();
  if (g.res) return g.res;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'body', 'Invalid request.');
  try {
    const r = await sendNewCaseEmails({ caseId: parsed.data.caseId, triggeredBy: 'admin:' + g.admin.id });
    return r.status === 'skipped' ? fail(409, 'skipped', r.reason) : json(r);
  } catch (e) {
    return handleError(e);
  }
}
