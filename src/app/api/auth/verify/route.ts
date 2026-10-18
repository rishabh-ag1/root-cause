import { z } from 'zod';
import { json, fail, handleError, readJson } from '@/lib/api';
import { userClient } from '@/lib/supabase/server';
import { CodeError, verifyCode } from '@/lib/loginCode';
import { rateLimited } from '@/lib/rateLimit';

const Body = z.object({ email: z.string().trim().email().max(200), code: z.string().regex(/^\d{4}$/) });

/** Checks a 4-digit code and, if right, signs the browser in (session cookies set by Supabase). */
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited('verify-ip:' + ip, 20, 10 * 60_000)) return fail(429, 'rate', 'Too many tries. Wait a few minutes.');
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'code', 'Enter the 4-digit code from your email.');
  try {
    const tokenHash = await verifyCode(parsed.data.email, parsed.data.code);
    const { error } = await (await userClient()).auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    if (e instanceof CodeError) return fail(400, e.code, e.message);
    return handleError(e);
  }
}
