import { z } from 'zod';
import { json, fail, handleError, readJson } from '@/lib/api';
import { adminClient } from '@/lib/supabase/server';
import { verifyUnsubscribe } from '@/lib/email';

const Body = z.object({ u: z.string().uuid(), t: z.string().min(10).max(100) });

async function optOut(u: string, t: string) {
  if (!verifyUnsubscribe(u, t)) return fail(400, 'token', 'This unsubscribe link is invalid.');
  try {
    const { error } = await adminClient().from('profiles').update({ email_opt_out: true }).eq('id', u);
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

/** Unsubscribe page button. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  // RFC 8058 one-click unsubscribe from mail clients posts to the List-Unsubscribe URL with the params in the query.
  const q = { u: url.searchParams.get('u'), t: url.searchParams.get('t') };
  const parsed = Body.safeParse(q.u && q.t ? q : await readJson(req));
  if (!parsed.success) return fail(400, 'body', 'Invalid request.');
  return optOut(parsed.data.u, parsed.data.t);
}
