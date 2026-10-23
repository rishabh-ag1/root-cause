import { json, handleError } from '@/lib/api';
import { guardAdmin } from '@/lib/adminApi';
import { listAllUsers } from '@/lib/admin';
import { computeStats } from '@/lib/adminStats';
import { adminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Analytics computed straight from the database. Aggregates only: no emails or usernames are returned. */
export async function GET() {
  const g = await guardAdmin();
  if (g.res) return g.res;
  try {
    const sb = adminClient();
    const [users, profiles, attempts, cases] = await Promise.all([
      listAllUsers(),
      sb.from('profiles').select('id'),
      sb.from('attempts').select('user_id, case_id, started_at, finished_at, opened, wrong, solved, bonus_correct, score, elapsed_seconds, flagged'),
      sb.from('cases').select('id, case_number, title, company, difficulty, par, publish_date, status, evidence, causes, answer_index'),
    ]);
    for (const r of [profiles, attempts, cases]) if (r.error) throw r.error;
    type C = { evidence: { title: string }[]; causes: { label: string }[] } & Record<string, unknown>;
    const stats = computeStats({
      users: users.filter((u) => u.last_sign_in_at).map((u) => ({ id: u.id, created_at: u.created_at })),
      profiles: (profiles.data ?? []) as { id: string }[],
      attempts: (attempts.data ?? []) as Parameters<typeof computeStats>[0]['attempts'],
      cases: ((cases.data ?? []) as C[]).map((c) => ({
        ...(c as unknown as Parameters<typeof computeStats>[0]['cases'][number]),
        files: c.evidence.map((e) => e.title),
        causes: c.causes.map((x) => x.label),
      })),
    });
    return json(stats);
  } catch (e) {
    return handleError(e);
  }
}
