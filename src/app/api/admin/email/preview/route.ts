import { json, fail } from '@/lib/api';
import { guardAdmin } from '@/lib/adminApi';
import { mailerConfigured, smtpErrorHint } from '@/lib/email';
import { sendNewCasePreview } from '@/lib/release';

export const maxDuration = 30;

/** Sends the signed-in admin a preview of the next new-case email (doesn't count as the real send). */
export async function POST() {
  const g = await guardAdmin();
  if (g.res) return g.res;
  if (!mailerConfigured()) return fail(400, 'not_configured', 'Email is not configured in Vercel.');
  if (!g.admin.email) return fail(400, 'no_email', 'Your account has no email address.');
  try {
    return json(await sendNewCasePreview({ id: g.admin.id, email: g.admin.email }));
  } catch (e) {
    const msg = (e as Error).message;
    return fail(502, 'preview', msg.startsWith('No scheduled') ? msg : smtpErrorHint(e));
  }
}
