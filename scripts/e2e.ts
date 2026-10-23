/**
 * End-to-end player journey against a running site (production by default).
 *
 *   npm run e2e                      # https://playrootcause.vercel.app
 *   BASE_URL=http://localhost:3000 npm run e2e
 *
 * A throwaway player (e2e-…@example.com) signs in with a 4-digit code, picks a username,
 * plays today's case to the end, shows up on the leaderboard, and is deleted afterwards.
 * The email itself can't be read here, so the test plants a known code in login_codes using
 * the same HMAC the server uses; every step after "email sent" is exercised for real.
 */
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const BASE = (process.env.BASE_URL || 'https://playrootcause.vercel.app').replace(/\/$/, '');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error('Run with .env.local (npm run e2e).');
const sb = createClient(url, key, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  results.push(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? `  →  ${detail}` : ''}`);
}

// ---- tiny cookie jar, so the session cookie Supabase sets on sign-in is sent back
const jar = new Map<string, string>();
async function call(path: string, init: { method?: string; body?: unknown; anon?: boolean } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.' + (Date.now() % 250) };
  if (!init.anon && jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(BASE + path, { method: init.method ?? (init.body ? 'POST' : 'GET'), headers, body: init.body ? JSON.stringify(init.body) : undefined, redirect: 'manual' });
  if (!init.anon)
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (/max-age=0/i.test(c) || value === '') jar.delete(name);
      else jar.set(name, value);
    }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data, text };
}

const secret = process.env.UNSUBSCRIBE_SECRET || key;
const plant = async (email: string, code: string) =>
  sb.from('login_codes').upsert({
    email,
    code_hash: createHmac('sha256', secret).update(`login:${email}:${code}`).digest('base64url'),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    attempts: 0,
    sends: 1,
    window_started_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 60_000).toISOString(),
  });

async function main() {
  const stamp = Date.now().toString(36);
  const email = `e2e-${stamp}@example.com`;
  const username = `e2e_${stamp}`.slice(0, 20);
  console.log(`Root Cause e2e against ${BASE}\n`);

  // 1. Anyone can read today's case; nothing secret leaks
  const today = await call('/api/case/today', { anon: true });
  const pc = today.data.case as { id: number; caseNumber: number; files: unknown[]; causes: string[] } | undefined;
  check('Home page loads', (await fetch(BASE + '/')).status === 200);
  check("Today's case loads without signing in", today.status === 200 && !!pc, today.text.slice(0, 120));
  check('No answer, hidden files or explanation in the public case', !/answer_index|"body"|"explanation"|"feedback"/.test(today.text));
  if (!pc) throw new Error('No live case: schedule one in /admin first.');

  // 2. Guard rails before signing in
  check('Opening a file without signing in asks for sign-in (401)', (await call('/api/attempt/open', { body: { caseId: pc.id, index: 0 }, anon: true })).status === 401);
  check('Bad email is rejected with a clear message', (await call('/api/auth/code', { body: { email: 'not-an-email' }, anon: true })).status === 400);
  check('Malformed code is rejected', (await call('/api/auth/verify', { body: { email, code: '12' }, anon: true })).status === 400);

  // 3. Sign in with a 4-digit code (brand-new player)
  const { error: plantErr } = await plant(email, '4821');
  check('Test code planted', !plantErr, plantErr?.message);
  const wrong = await call('/api/auth/verify', { body: { email, code: '0000' } });
  check('Wrong code says how many tries are left', wrong.status === 400 && /tries? left/.test(String((wrong.data.error as { message?: string })?.message)), wrong.text);
  const ok = await call('/api/auth/verify', { body: { email, code: '4821' } });
  check('Right code signs a new player in', ok.status === 200, ok.text);
  check('Sign-in sets a session cookie', [...jar.keys()].some((k) => k.includes('auth-token')), [...jar.keys()].join(','));
  check('A used code cannot be reused', (await call('/api/auth/verify', { body: { email, code: '4821' }, anon: true })).status === 400);

  const me = await call('/api/profile');
  const meData = me.data.me as { id?: string; username?: string | null } | null;
  check('Signed-in player is recognised', !!meData?.id, me.text);
  check('New player has no username yet', meData?.username === null);
  check('Playing before picking a username is blocked (403)', (await call('/api/attempt/open', { body: { caseId: pc.id, index: 0 } })).status === 403);

  // 4. Username
  check('Rude or invalid usernames are rejected', (await call('/api/profile', { body: { username: 'a' } })).status === 400);
  const named = await call('/api/profile', { body: { username } });
  check('Picking a username works', named.status === 200, named.text);
  check('A taken username is refused', (await call('/api/profile', { body: { username: 'sherlock_rishabh' } })).status === 409);

  // 5. Play today's case to the end
  const { data: full } = await sb.from('cases').select('answer_index, bonus').eq('id', pc.id).single();
  const answer = (full as { answer_index: number }).answer_index;
  const wrongCause = answer === 0 ? 1 : 0;
  const open1 = await call('/api/attempt/open', { body: { caseId: pc.id, index: 0 } });
  check('Opening a file returns its contents', open1.status === 200 && Array.isArray(open1.data.body), open1.text.slice(0, 120));
  const open1b = await call('/api/attempt/open', { body: { caseId: pc.id, index: 0 } });
  check('Re-opening the same file costs nothing extra', (open1b.data.opened as number[])?.length === 1);
  const after = await call('/api/case/today');
  check('Progress survives a page reload', ((after.data.attempt as { opened?: number[] })?.opened ?? []).length === 1);
  check('Still no answer leaked mid-game', !/answer_index|"explanation"/.test(after.text));
  const w = await call('/api/attempt/accuse', { body: { caseId: pc.id, causeIndex: wrongCause } });
  check('A wrong guess explains why', w.status === 200 && w.data.result === 'wrong' && typeof w.data.feedback === 'string', w.text.slice(0, 120));
  check('The same wrong guess cannot be repeated', (await call('/api/attempt/accuse', { body: { caseId: pc.id, causeIndex: wrongCause } })).status === 409);
  const right = await call('/api/attempt/accuse', { body: { caseId: pc.id, causeIndex: answer } });
  const fin = right.data.final as { rank?: number; share?: string } | null;
  check('The right answer closes the case with a score', right.status === 200 && right.data.result === 'correct', right.text.slice(0, 160));
  check('Result includes a rank and a share link with a challenge', !!fin?.rank && !!fin?.share?.includes(`c=${username}`), JSON.stringify(fin)?.slice(0, 160));
  const score = (right.data.attempt as { score?: number })?.score;
  check('Score follows the rules (1000 − 75 − 250 − time)', typeof score === 'number' && score <= 675 && score >= 525, String(score));
  const bonus = await call('/api/attempt/bonus', { body: { caseId: pc.id, optionIndex: 0 } });
  check('Bonus question can be answered once', bonus.status === 200, bonus.text.slice(0, 120));
  check('…and the score does not change', (bonus.data.attempt as { score?: number })?.score === score);
  check('A second attempt at the same case is refused', (await call('/api/attempt/open', { body: { caseId: pc.id, index: 1 } })).status === 409);

  // 6. Leaderboard, challenge, stats
  const lb = await call('/api/leaderboard', { anon: true });
  check('Player appears on the public leaderboard', JSON.stringify(lb.data).includes(username));
  check('Leaderboard never shows emails', !/@example\.com/.test(lb.text));
  const ch = await call(`/api/challenge?u=${username}`, { anon: true });
  check('Challenge link shows the score to friends', ch.status === 200 && ch.data.score === score, ch.text);
  const reload = await call('/api/case/today');
  check('Streak and title are tracked', (reload.data.stats as { streak?: number })?.streak === 1 && !!(reload.data.stats as { title?: string })?.title, JSON.stringify(reload.data.stats));
  check('After finishing, the solution is revealed', /"explanation"/.test(reload.text));

  // 7. Sign-in fallback path (no inbox needed to check the server side)
  const fb = await call('/api/auth/code', { body: { email: `e2e-fb-${stamp}@example.com` }, anon: true });
  check('Asking for a code never errors (sends 4-digit code, or falls back cleanly)', fb.status === 200 || fb.status === 501, fb.text);
  if (fb.status === 501) results.push('  ! Our 4-digit email is not sending, so players get Supabase\'s code email instead. Use Admin → Emails → "Send me a test email" to see why.');
  else results.push('  · 4-digit code emails are sending.');
}

async function cleanup() {
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const mine = (data?.users ?? []).filter((u) => /^e2e-(fb-)?[a-z0-9]+@example\.com$/.test(u.email ?? ''));
  for (const u of mine) await sb.auth.admin.deleteUser(u.id);
  await sb.from('login_codes').delete().like('email', 'e2e-%@example.com');
  results.push(`  · cleaned up ${mine.length} test account(s)`);
}

main()
  .catch((e) => check('Run completed', false, (e as Error).message))
  .finally(async () => {
    await cleanup().catch((e) => results.push('  ! cleanup failed: ' + (e as Error).message));
    console.log(results.join('\n'));
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
