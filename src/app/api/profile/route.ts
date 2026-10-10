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
    const { data, error } = await adminClient().from('profiles').select('username').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return json({ me: { email: user.email ?? null, username: (data as { username: string } | null)?.username ?? null } });
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
