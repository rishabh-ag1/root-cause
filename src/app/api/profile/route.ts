import { z } from 'zod';
import { json, fail, handleError, readJson } from '@/lib/api';
import { adminClient, currentUser } from '@/lib/supabase/server';
import { Username } from '@/lib/username';
import { rateLimited } from '@/lib/rateLimit';

const Body = z.object({ username: Username });

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) return json({ me: null });
  try {
    const { data, error } = await adminClient().from('profiles').select('username, is_admin, email_opt_out').eq('id', user.id).maybeSingle();
    if (error) throw error;
    const p = data as { username: string; is_admin: boolean; email_opt_out: boolean } | null;
    return json({ me: { id: user.id, email: user.email ?? null, username: p?.username ?? null, isAdmin: !!p?.is_admin, emailOptOut: !!p?.email_opt_out } });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return fail(401, 'auth', 'Sign in first.');
  if (rateLimited('p:' + user.id, 10)) return fail(429, 'rate', 'Slow down a little.');
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'username', parsed.error.issues[0]?.message ?? 'Invalid username.');
  try {
    const { error } = await adminClient().from('profiles').upsert({ id: user.id, username: parsed.data.username }, { onConflict: 'id' });
    if (error?.code === '23505') return fail(409, 'taken', 'That username is taken.');
    if (error) throw error;
    return json({ username: parsed.data.username });
  } catch (e) {
    return handleError(e);
  }
}

const Prefs = z.object({ emailOptOut: z.boolean() });

/** Email preferences ("email me when a new case is live"). */
export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return fail(401, 'auth', 'Sign in first.');
  const parsed = Prefs.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'body', 'Invalid request.');
  try {
    const { error } = await adminClient().from('profiles').update({ email_opt_out: parsed.data.emailOptOut }).eq('id', user.id);
    if (error) throw error;
    return json({ emailOptOut: parsed.data.emailOptOut });
  } catch (e) {
    return handleError(e);
  }
}
