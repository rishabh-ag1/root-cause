import 'server-only';
import type { User } from '@supabase/supabase-js';
import { adminClient, currentUser } from './supabase/server';
import { caseDay, caseNumberFor, launchDate } from './dates';
import type { CaseFile } from './caseSchema';

/** The signed-in admin, or null. Admin is a flag on the profile, set in the database. */
export async function getAdmin(): Promise<User | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data } = await adminClient().from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  return (data as { is_admin?: boolean } | null)?.is_admin ? user : null;
}

export type AdminCaseRow = {
  id: number;
  slug: string;
  title: string;
  company: string;
  difficulty: string;
  par: number;
  status: 'draft' | 'scheduled' | 'live';
  publish_date: string | null;
  case_number: number | null;
  files: number;
  causes: number;
  attempts: number;
  state: 'library' | 'scheduled' | 'live' | 'past';
  email: { sent: number; failed: number; recipients: number; finished_at: string | null } | null;
};

type CaseLite = Omit<AdminCaseRow, 'files' | 'causes' | 'attempts' | 'state' | 'email'> & { evidence: unknown[]; causes: unknown[] };

export async function listCasesForAdmin(): Promise<AdminCaseRow[]> {
  const sb = adminClient();
  const [cases, attempts, emails] = await Promise.all([
    sb.from('cases').select('id, slug, title, company, difficulty, par, status, publish_date, case_number, evidence, causes').order('publish_date', { ascending: true, nullsFirst: false }),
    sb.from('attempts').select('case_id'),
    sb.from('case_emails').select('case_id, sent, failed, recipients, finished_at'),
  ]);
  if (cases.error) throw cases.error;
  if (attempts.error) throw attempts.error;
  if (emails.error) throw emails.error;
  const counts = new Map<number, number>();
  for (const a of (attempts.data ?? []) as { case_id: number }[]) counts.set(a.case_id, (counts.get(a.case_id) ?? 0) + 1);
  const mail = new Map((emails.data ?? []).map((e: { case_id: number } & AdminCaseRow['email']) => [e!.case_id, e]));
  const today = caseDay();
  return ((cases.data ?? []) as CaseLite[]).map((c) => {
    const state: AdminCaseRow['state'] =
      c.status === 'draft' || !c.publish_date ? 'library' : c.publish_date > today ? 'scheduled' : c.publish_date === today ? 'live' : 'past';
    const e = mail.get(c.id);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      company: c.company,
      difficulty: c.difficulty,
      par: c.par,
      status: c.status,
      publish_date: c.publish_date,
      case_number: c.case_number,
      files: c.evidence.length,
      causes: c.causes.length,
      attempts: counts.get(c.id) ?? 0,
      state,
      email: e ? { sent: e.sent, failed: e.failed, recipients: e.recipients, finished_at: e.finished_at } : null,
    };
  });
}

export class AdminError extends Error {}

/**
 * Put a case on a date (or back in the library with date = null).
 * Rules: dates are today or later; one case per date; a case that has gone live or has plays can't move.
 */
export async function scheduleCase(caseId: number, date: string | null) {
  const sb = adminClient();
  const { data: c, error } = await sb.from('cases').select('id, status, publish_date').eq('id', caseId).maybeSingle();
  if (error) throw error;
  if (!c) throw new AdminError('Case not found.');
  const today = caseDay();
  const row = c as { id: number; status: string; publish_date: string | null };
  if (row.status !== 'draft' && row.publish_date && row.publish_date <= today)
    throw new AdminError('This case has already gone live, so its date is locked.');
  const { count } = await sb.from('attempts').select('id', { count: 'exact', head: true }).eq('case_id', caseId);
  if ((count ?? 0) > 0) throw new AdminError('People have already played this case, so its date is locked.');

  if (date === null) {
    const { error: e } = await sb.from('cases').update({ status: 'draft', publish_date: null, case_number: null }).eq('id', caseId);
    if (e) throw e;
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AdminError('Pick a valid date.');
  if (date < today) throw new AdminError('That date is in the past.');
  const { data: clash } = await sb.from('cases').select('id, title').eq('publish_date', date).neq('id', caseId).maybeSingle();
  if (clash) throw new AdminError(`"${(clash as { title: string }).title}" is already scheduled for ${date}. Unschedule it first.`);
  const caseNumber = caseNumberFor(date, launchDate());
  const { error: e } = await sb.from('cases').update({ status: 'scheduled', publish_date: date, case_number: caseNumber }).eq('id', caseId);
  if (e?.code === '23505') throw new AdminError(`Case number #${caseNumber} is already taken by another case.`);
  if (e) throw e;
}

/** Full content of any case, for the admin preview (answer included). */
export async function getCaseForAdmin(caseId: number) {
  const { data, error } = await adminClient()
    .from('cases')
    .select('id, slug, title, company, difficulty, par, status, publish_date, case_number, brief, evidence, causes, answer_index, bonus, explanation')
    .eq('id', caseId)
    .maybeSingle();
  if (error) throw error;
  return data as (Pick<CaseFile, 'title' | 'company' | 'difficulty' | 'par' | 'brief' | 'evidence' | 'causes' | 'answer_index' | 'bonus' | 'explanation'> & {
    id: number;
    slug: string;
    status: string;
    publish_date: string | null;
    case_number: number | null;
  }) | null;
}

/** Every auth user (paginated), for analytics and emails. Emails never leave the server. */
export async function listAllUsers(): Promise<User[]> {
  const sb = adminClient();
  const users: User[] = [];
  for (let page = 1; page < 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}
