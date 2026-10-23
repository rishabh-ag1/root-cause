import { z } from 'zod';
import { json, fail, handleError, readJson, clientIp } from '@/lib/api';
import { mailerConfigured } from '@/lib/email';
import { CodeError, CODE_DIGITS, ensureAccount, MailError, requestCode } from '@/lib/loginCode';
import { rateLimited } from '@/lib/rateLimit';

const Body = z.object({ email: z.string().trim().email().max(200) });

/**
 * Emails a 4-digit sign-in code. If our mailer isn't set up or fails, responds 501 "fallback" so the
 * client asks Supabase for its code email instead. Before falling back, the account is created and
 * confirmed, so Supabase sends its code email (not the link-only "Confirm signup" email) even to
 * brand-new players.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (rateLimited('code-ip:' + ip, 10, 10 * 60_000)) return fail(429, 'rate', 'Too many requests. Try again in a few minutes.');
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return fail(400, 'email', 'Enter a valid email address.');
  const email = parsed.data.email;

  const fallback = async (why: string) => {
    console.error('4-digit code unavailable, using Supabase code email:', why);
    try {
      await ensureAccount(email);
    } catch (e) {
      console.error('ensureAccount failed:', (e as Error).message);
    }
    return fail(501, 'fallback', 'Use the default sign-in.');
  };

  if (!mailerConfigured()) return fallback('SMTP not configured');
  try {
    await requestCode(email);
    return json({ ok: true, digits: CODE_DIGITS });
  } catch (e) {
    if (e instanceof CodeError) return fail(429, e.code, e.message);
    if (e instanceof MailError) return fallback(e.message);
    return handleError(e);
  }
}
