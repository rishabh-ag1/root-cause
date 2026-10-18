import { z } from 'zod';
import { json, fail, handleError, readJson } from '@/lib/api';
import { mailerConfigured } from '@/lib/email';
import { CodeError, CODE_DIGITS, MailError, requestCode } from '@/lib/loginCode';
import { rateLimited } from '@/lib/rateLimit';

const Body = z.object({ email: z.string().trim().email().max(200) });

/** Emails a 4-digit sign-in code. Returns 501 "fallback" when SMTP isn't set up, so the client uses Supabase's 6-digit code instead. */
export async function POST(req: Request) {
  if (!mailerConfigured()) return fail(501, 'fallback', 'Use the default sign-in.');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited('code-ip:' + ip, 10, 10 * 60_000)) return fail(429, 'rate', 'Too many requests. Try again in a few minutes.');
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'email', 'Enter a valid email address.');
  try {
    await requestCode(parsed.data.email);
    return json({ ok: true, digits: CODE_DIGITS });
  } catch (e) {
    if (e instanceof CodeError) return fail(429, e.code, e.message);
    if (e instanceof MailError) {
      // Never block sign-in on our mailer: log why, and let the client use Supabase's code email.
      console.error('4-digit code email failed:', e.message);
      return fail(501, 'fallback', 'Use the default sign-in.');
    }
    return handleError(e);
  }
}
