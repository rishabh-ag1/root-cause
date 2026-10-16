import { json, fail } from '@/lib/api';
import { sendNewCaseEmails } from '@/lib/release';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Daily release job. Vercel Cron calls this at 03:30 UTC (09:00 IST), sending
 * `Authorization: Bearer $CRON_SECRET`. If today's case went live, everyone gets the email (once).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail(503, 'not_configured', 'CRON_SECRET is not set.');
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return fail(401, 'auth', 'Unauthorized.');
  try {
    return json(await sendNewCaseEmails({ triggeredBy: 'cron' }));
  } catch (e) {
    console.error(e);
    return fail(500, 'server', (e as Error).message);
  }
}
