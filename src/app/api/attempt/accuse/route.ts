import { z } from 'zod';
import { guardWrite, handleError, json, fail } from '@/lib/api';
import { getCaseById, mutateAttempt } from '@/lib/repo';
import { applyAccuse, playerView } from '@/lib/game';
import { resultPayload } from '@/lib/result';

const Body = z.object({ caseId: z.number().int(), causeIndex: z.number().int() });

export async function POST(req: Request) {
  const g = await guardWrite(req, Body);
  if (g.res) return g.res;
  try {
    const c = await getCaseById(g.body.caseId);
    if (!c) return fail(404, 'no_case', 'Case not found.');
    const now = new Date().toISOString();
    const { attempt, out } = await mutateAttempt(g.user.id, c.id, (a) => applyAccuse(a, c, g.body.causeIndex, now));
    const final = out.result === 'unsolved' ? await resultPayload(c, attempt, g.user.id) : null;
    return json({ serverNow: now, causeIndex: g.body.causeIndex, ...out, attempt: playerView(attempt, c), final });
  } catch (e) {
    return handleError(e);
  }
}
