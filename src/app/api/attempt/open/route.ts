import { z } from 'zod';
import { guardWrite, handleError, json, fail } from '@/lib/api';
import { getCaseById, mutateAttempt } from '@/lib/repo';
import { applyOpen } from '@/lib/game';

const Body = z.object({ caseId: z.number().int(), index: z.number().int() });

export async function POST(req: Request) {
  const g = await guardWrite(req, Body);
  if (g.res) return g.res;
  try {
    const c = await getCaseById(g.body.caseId);
    if (!c) return fail(404, 'no_case', 'Case not found.');
    const now = new Date().toISOString();
    const out = await mutateAttempt(g.user.id, c.id, (a) => applyOpen(a, c, g.body.index, now));
    return json({ serverNow: now, index: g.body.index, body: out.body, startedAt: out.attempt.started_at, opened: out.attempt.opened });
  } catch (e) {
    return handleError(e);
  }
}
