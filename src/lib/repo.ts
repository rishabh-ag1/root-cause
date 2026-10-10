import 'server-only';
import { adminClient } from './supabase/server';
import { istDate } from './dates';
import { emptyAttempt, type Attempt, type StoredCase } from './game';

const CASE_COLS = 'id, case_number, publish_date, difficulty, title, company, brief, evidence, causes, answer_index, bonus, explanation, par, status';
const ATTEMPT_COLS = 'id, rev, started_at, opened, wrong, solved, solved_at, bonus_correct, finished_at, score, elapsed_seconds, flagged';

type AttemptRow = Attempt & { id: string; rev: number };

/** Today's case: the latest published case on or before today's IST date. */
export async function getTodayCase(): Promise<StoredCase | null> {
  const { data, error } = await adminClient()
    .from('cases')
    .select(CASE_COLS)
    .neq('status', 'draft')
    .lte('publish_date', istDate())
    .order('publish_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as StoredCase | null) ?? null;
}

export async function getCaseById(id: number): Promise<StoredCase | null> {
  const { data, error } = await adminClient().from('cases').select(CASE_COLS).eq('id', id).neq('status', 'draft').maybeSingle();
  if (error) throw error;
  return (data as StoredCase | null) ?? null;
}

export async function getCaseByNumber(n: number): Promise<StoredCase | null> {
  const { data, error } = await adminClient().from('cases').select(CASE_COLS).eq('case_number', n).neq('status', 'draft').lte('publish_date', istDate()).maybeSingle();
  if (error) throw error;
  return (data as StoredCase | null) ?? null;
}

export async function getProfile(userId: string): Promise<{ username: string } | null> {
  const { data, error } = await adminClient().from('profiles').select('username').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data as { username: string } | null) ?? null;
}

export async function getAttempt(userId: string, caseId: number): Promise<AttemptRow | null> {
  const { data, error } = await adminClient().from('attempts').select(ATTEMPT_COLS).eq('user_id', userId).eq('case_id', caseId).maybeSingle();
  if (error) throw error;
  return (data as AttemptRow | null) ?? null;
}

/** Creates the one attempt for this user and case, or returns the existing one. The DB unique constraint is the real guard. */
async function getOrCreateAttempt(userId: string, caseId: number): Promise<AttemptRow> {
  const existing = await getAttempt(userId, caseId);
  if (existing) return existing;
  const { error } = await adminClient()
    .from('attempts')
    .upsert({ user_id: userId, case_id: caseId }, { onConflict: 'user_id,case_id', ignoreDuplicates: true });
  if (error) throw error;
  const row = await getAttempt(userId, caseId);
  if (!row) throw new Error('attempt not created');
  return row;
}

export class ConflictError extends Error {}

/**
 * Load → apply a pure transition → save, guarded by the `rev` column so two simultaneous
 * requests can't both apply against the same old state. Retries a couple of times on conflict.
 */
export async function mutateAttempt<T>(userId: string, caseId: number, fn: (a: Attempt) => { attempt: Attempt } & T): Promise<{ attempt: Attempt } & T> {
  for (let tries = 0; tries < 3; tries++) {
    const row = await getOrCreateAttempt(userId, caseId);
    const { id, rev, ...current } = row;
    const out = fn({ ...emptyAttempt(), ...current });
    const a = out.attempt;
    const { data, error } = await adminClient()
      .from('attempts')
      .update({
        started_at: a.started_at,
        opened: a.opened,
        wrong: a.wrong,
        solved: a.solved,
        solved_at: a.solved_at,
        bonus_correct: a.bonus_correct,
        finished_at: a.finished_at,
        score: a.score,
        elapsed_seconds: a.elapsed_seconds,
        flagged: a.flagged,
        rev: rev + 1,
      })
      .eq('id', id)
      .eq('rev', rev)
      .select('id');
    if (error) throw error;
    if (data && data.length === 1) return out;
  }
  throw new ConflictError('Too many simultaneous requests. Try again.');
}

export type BoardRow = {
  rank: number;
  username: string;
  score: number;
  files: number;
  wrong: number;
  elapsed_seconds: number;
  bonus_correct: boolean;
  solved: boolean;
};

const BOARD_COLS = 'rank, username, score, files, wrong, elapsed_seconds, bonus_correct, solved';

export async function caseLeaderboard(caseId: number, userId: string | null) {
  const sb = adminClient();
  const [top, count, mine] = await Promise.all([
    sb.rpc('leaderboard_case', { p_case_id: caseId }).select(BOARD_COLS).range(0, 99),
    sb.from('attempts').select('id', { count: 'exact', head: true }).eq('case_id', caseId).not('finished_at', 'is', null),
    userId ? sb.rpc('leaderboard_case', { p_case_id: caseId }).select(BOARD_COLS).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (top.error) throw top.error;
  if (count.error) throw count.error;
  if (mine.error) throw mine.error;
  const me = (mine.data as BoardRow | null) ?? null;
  let around: BoardRow[] = [];
  if (me && me.rank > 100) {
    // Ranks can tie, so take a window of the ordered list around the player's position.
    const { data, error } = await sb
      .rpc('leaderboard_case', { p_case_id: caseId })
      .select(BOARD_COLS)
      .range(Math.max(0, me.rank - 3), me.rank + 1);
    if (error) throw error;
    around = (data as BoardRow[]) ?? [];
  }
  return { top: (top.data as BoardRow[]) ?? [], total: count.count ?? 0, me, around };
}

export type WeekRow = { rank: number; username: string; score: number; played: number; elapsed_seconds: number };

export async function weekLeaderboard(userId: string | null) {
  const sb = adminClient();
  const end = istDate();
  const cols = 'rank, username, score, played, elapsed_seconds';
  const [top, mine] = await Promise.all([
    sb.rpc('leaderboard_week', { p_end_date: end }).select(cols).range(0, 99),
    userId ? sb.rpc('leaderboard_week', { p_end_date: end }).select(cols).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (top.error) throw top.error;
  if (mine.error) throw mine.error;
  return { top: (top.data as WeekRow[]) ?? [], me: (mine.data as WeekRow | null) ?? null };
}
