import 'server-only';
import { adminClient } from './supabase/server';
import { caseDay } from './dates';
import { listAllUsers } from './admin';
import { mailerConfigured, sendMail } from './email';
import { newCaseEmail, type NewCaseEmailInput } from './newCaseEmail';
import { computePlayerStats, type StatsAttempt, type StatsCase } from './playerStats';

export type ReleaseResult =
  | { status: 'sent'; caseNumber: number | null; recipients: number; sent: number; failed: number }
  | { status: 'skipped'; reason: string };

type CaseRow = {
  id: number;
  case_number: number | null;
  company: string;
  difficulty: string;
  publish_date: string | null;
  status: string;
  brief: { headline: string; story: string; facts?: { label: string; value: string }[] };
};

type Row = StatsAttempt & { user_id: string };

/** Everything the email needs that is the same for every recipient, plus a per-player lookup. */
async function emailContext(c: CaseRow) {
  const sb = adminClient();
  const [live, attempts, profiles] = await Promise.all([
    sb.from('cases').select('id, company, publish_date, skills').neq('status', 'draft').lte('publish_date', c.publish_date!).order('publish_date'),
    sb.from('attempts').select('user_id, case_id, finished_at, solved, score'),
    sb.from('profiles').select('id, username, email_opt_out'),
  ]);
  for (const r of [live, attempts, profiles]) if (r.error) throw r.error;
  const cases = (live.data ?? []) as (StatsCase & { company: string })[];
  const rows = (attempts.data ?? []) as Row[];
  const prof = new Map(((profiles.data ?? []) as { id: string; username: string; email_opt_out: boolean }[]).map((p) => [p.id, p]));

  // Yesterday's case (the one before this), for "N detectives took on X; top score Y by @z".
  const prevCase = cases.filter((x) => x.id !== c.id).at(-1) ?? null;
  let previous: NewCaseEmailInput['previous'] = null;
  if (prevCase) {
    const done = rows.filter((r) => r.case_id === prevCase.id && r.finished_at);
    const best = done.filter((r) => r.solved).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    previous = { company: prevCase.company, players: done.length, topScore: best?.score ?? null, topPlayer: best ? prof.get(best.user_id)?.username ?? null : null };
  }

  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);

  const forUser = (userId: string): NewCaseEmailInput => {
    const s = computePlayerStats(cases, byUser.get(userId) ?? [], c.id);
    return {
      userId,
      username: prof.get(userId)?.username ?? null,
      caseNumber: c.case_number,
      company: c.company,
      difficulty: c.difficulty,
      headline: c.brief.headline,
      story: c.brief.story,
      facts: c.brief.facts ?? [],
      previous,
      me: { streak: s.streak, played: s.played, title: s.title, next: s.next, toNext: s.toNext },
    };
  };
  const optedOut = (userId: string) => !!prof.get(userId)?.email_opt_out;
  return { forUser, optedOut };
}

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
    const [users, ctx] = await Promise.all([listAllUsers(), emailContext(c)]);
    const recipients = users.filter((u) => u.email && u.last_sign_in_at && !ctx.optedOut(u.id));

    let sent = 0;
    let failed = 0;
    const queue = [...recipients];
    const worker = async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        try {
          await sendMail({ to: u.email!, ...newCaseEmail(ctx.forUser(u.id)) });
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

/**
 * A preview of the new-case email for one admin, without touching the send log.
 * Uses the next scheduled case (or today's), so you see exactly what players will get.
 */
export async function sendNewCasePreview(admin: { id: string; email: string }) {
  const sb = adminClient();
  const today = caseDay();
  const pick = async (future: boolean) => {
    let q = sb.from('cases').select('id, case_number, company, difficulty, publish_date, status, brief').neq('status', 'draft').not('publish_date', 'is', null);
    q = future ? q.gt('publish_date', today).order('publish_date', { ascending: true }) : q.lte('publish_date', today).order('publish_date', { ascending: false });
    const { data } = await q.limit(1).maybeSingle();
    return data as CaseRow | null;
  };
  const c = (await pick(true)) ?? (await pick(false));
  if (!c) throw new Error('No scheduled or live case to preview.');
  const ctx = await emailContext(c);
  const m = newCaseEmail(ctx.forUser(admin.id));
  await sendMail({ to: admin.email, ...m, subject: '[Preview] ' + m.subject });
  return { caseNumber: c.case_number, company: c.company, subject: m.subject };
}
