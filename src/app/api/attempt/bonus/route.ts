import { z } from 'zod';
import { guardWrite, handleError, json, fail } from '@/lib/api';
import { getCaseById, mutateAttempt } from '@/lib/repo';
import { applyBonus, playerView } from '@/lib/game';
import { resultPayload } from '@/lib/result';

const Body = z.object({ caseId: z.number().int(), optionIndex: z.number().int() });

export async function POST(req: Request) {
  const g = await guardWrite(req, Body);
  if (g.res) return g.res;
  try {
    const c = await getCaseById(g.body.caseId);
    if (!c) return fail(404, 'no_case', 'Case not found.');
    const now = new Date().toISOString();
    const { attempt, bonusCorrect } = await mutateAttempt(g.user.id, c.id, (a) => applyBonus(a, c, g.body.optionIndex, now));
    return json({ serverNow: now, bonusCorrect, attempt: playerView(attempt, c), final: await resultPayload(c, attempt, g.user.id) });
  } catch (e) {
    return handleError(e);
  }
}
