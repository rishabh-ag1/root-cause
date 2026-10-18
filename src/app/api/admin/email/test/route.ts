import { json, fail } from '@/lib/api';
import { guardAdmin } from '@/lib/adminApi';
import { fromAddress, mailerConfigured, sendMail, smtpErrorHint } from '@/lib/email';

export const maxDuration = 30;

/** Sends a test email to the signed-in admin and reports exactly what the mail server said. */
export async function POST() {
  const g = await guardAdmin();
  if (g.res) return g.res;
  if (!mailerConfigured()) return fail(400, 'not_configured', 'SMTP_HOST, SMTP_USER and SMTP_PASS are not all set in Vercel.');
  const to = g.admin.email;
  if (!to) return fail(400, 'no_email', 'Your account has no email address.');
  try {
    await sendMail({ to, subject: 'Root Cause test email', text: 'If you can read this, new-case emails and sign-in codes will work.', html: '<p>If you can read this, new-case emails and sign-in codes will work.</p>' });
    return json({ ok: true, to, from: fromAddress() });
  } catch (e) {
    return fail(502, 'smtp', smtpErrorHint(e));
  }
}
