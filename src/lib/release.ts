import 'server-only';
import { adminClient } from './supabase/server';
import { caseDay } from './dates';
import { listAllUsers } from './admin';
import { mailerConfigured, newCaseEmail, sendMail } from './email';

export type ReleaseResult =
  | { status: 'sent'; caseNumber: number | null; recipients: number; sent: number; failed: number }
  | { status: 'skipped'; reason: string };

type CaseRow = { id: number; case_number: number | null; company: string; difficulty: string; publish_date: string | null; status: string; brief: { headline: string; story: string } };

/**
 * Emails every player (who hasn't unsubscribed) that a case is live. At most once per case:
 * the unique row in case_emails is claimed before sending, so a retried cron never double-sends.
 * With no caseId, it uses the case that went live today (and does nothing if none did).
 */
export async function sendNewCaseEmails(opts: { caseId?: number; triggeredBy: string }): Promise<ReleaseResult> {
  if (!mailerConfigured()) return { status: 'skipped', reason: 'Email is not configured (SMTP_* env vars missing).' };
  const sb = adminClient();
  const today = caseDay();

  let q = sb.from('cases').select('id, case_number, company, difficulty, publish_date, status, brief').neq('status', 'draft');
  q = opts.caseId ? q.eq('id', opts.caseId) : q.eq('publish_date', today);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  const c = data as CaseRow | null;
  if (!c) return { status: 'skipped', reason: opts.caseId ? 'Case not found.' : 'No case goes live today.' };
  if (!c.publish_date || c.publish_date > today) return { status: 'skipped', reason: 'That case is not live yet.' };

  const { error: claimErr } = await sb.from('case_emails').insert({ case_id: c.id, triggered_by: opts.triggeredBy });
  if (claimErr?.code === '23505') return { status: 'skipped', reason: `Emails for case #${c.case_number} were already sent.` };
  if (claimErr) throw claimErr;

  try {
    const [users, optedOut] = await Promise.all([
      listAllUsers(),
      sb.from('profiles').select('id').eq('email_opt_out', true),
    ]);
    if (optedOut.error) throw optedOut.error;
    const skip = new Set((optedOut.data ?? []).map((r: { id: string }) => r.id));
    const recipients = users.filter((u) => u.email && u.last_sign_in_at && !skip.has(u.id));

    let sent = 0;
    let failed = 0;
    const queue = [...recipients];
    const worker = async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        try {
          const m = newCaseEmail({ caseNumber: c.case_number, company: c.company, headline: c.brief.headline, story: c.brief.story, difficulty: c.difficulty, userId: u.id });
          await sendMail({ to: u.email!, ...m });
          sent++;
        } catch (e) {
          failed++;
          console.error('new-case email failed', (e as Error).message);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await sb.from('case_emails').update({ finished_at: new Date().toISOString(), recipients: recipients.length, sent, failed }).eq('case_id', c.id);
    return { status: 'sent', caseNumber: c.case_number, recipients: recipients.length, sent, failed };
  } catch (e) {
    await sb.from('case_emails').update({ finished_at: new Date().toISOString(), error: (e as Error).message.slice(0, 500) }).eq('case_id', c.id);
    throw e;
  }
}
