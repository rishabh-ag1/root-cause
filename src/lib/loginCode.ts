import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { adminClient } from './supabase/server';
import { sendMail, siteUrl, smtpErrorHint } from './email';

/**
 * Our own 4-digit email sign-in codes (Supabase's minimum is 6 digits).
 * Safety comes from limits, not length: 10-minute expiry, 5 wrong guesses per code,
 * 5 codes per email per hour, 30 seconds between sends. Only an HMAC of the code is stored.
 */
export const CODE_DIGITS = 4;
const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;
const RESEND_AFTER_MS = 30_000;

/** Our mailer failed; the caller should fall back to Supabase's own code email. */
export class MailError extends Error {}

export class CodeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const hash = (email: string, code: string) => createHmac('sha256', secret()).update(`login:${email}:${code}`).digest('base64url');
export const normEmail = (e: string) => e.trim().toLowerCase();

type Row = { email: string; code_hash: string; expires_at: string; attempts: number; sends: number; window_started_at: string; created_at: string };

export async function requestCode(rawEmail: string) {
  const email = normEmail(rawEmail);
  const sb = adminClient();
  const { data } = await sb.from('login_codes').select('*').eq('email', email).maybeSingle();
  const row = data as Row | null;
  const now = Date.now();
  let sends = 1;
  let windowStart = new Date(now).toISOString();
  if (row) {
    if (now - new Date(row.created_at).getTime() < RESEND_AFTER_MS) throw new CodeError('wait', 'Wait a few seconds before asking for another code.');
    const inWindow = now - new Date(row.window_started_at).getTime() < 3600_000;
    if (inWindow && row.sends >= MAX_SENDS_PER_HOUR) throw new CodeError('limit', 'Too many codes requested. Try again in an hour.');
    if (inWindow) {
      sends = row.sends + 1;
      windowStart = row.window_started_at;
    }
  }
  const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
  const { error } = await sb.from('login_codes').upsert({
    email,
    code_hash: hash(email, code),
    expires_at: new Date(now + TTL_MS).toISOString(),
    attempts: 0,
    sends,
    window_started_at: windowStart,
    created_at: new Date(now).toISOString(),
  });
  if (error) throw error;

  const html = `<!doctype html><html><body style="margin:0;background:#e6dfcf;font-family:Helvetica,Arial,sans-serif;color:#1f2421">
<div style="max-width:480px;margin:0 auto;padding:24px 16px">
  <div style="font-weight:700;letter-spacing:3px;font-size:14px;text-transform:uppercase;margin-bottom:12px">Root Cause</div>
  <div style="background:#fbf8f1;border:1px solid #cfc5ad;border-top:6px solid #b8322a;border-radius:4px;padding:24px;text-align:center">
    <p style="margin:0 0 8px;font-size:15px">Your sign-in code</p>
    <div style="font-family:Menlo,Consolas,monospace;font-size:40px;font-weight:700;letter-spacing:12px;margin:8px 0 12px">${code}</div>
    <p style="margin:0;font-size:13px;color:#6c675b">Expires in 10 minutes. If you didn't ask for it, ignore this email.</p>
  </div>
  <p style="font-size:12px;color:#6c675b;margin:14px 0 0"><a href="${siteUrl()}" style="color:#6c675b">${siteUrl().replace(/^https?:\/\//, '')}</a></p>
</div></body></html>`;
  try {
    await sendMail({ to: email, subject: `${code} is your Root Cause code`, html, text: `Your Root Cause sign-in code is ${code}. It expires in 10 minutes.` });
  } catch (e) {
    await sb.from('login_codes').delete().eq('email', email);
    throw new MailError(smtpErrorHint(e));
  }
}

/** Checks the code. On success, returns a one-time token hash that signs the user in (creating them if new). */
export async function verifyCode(rawEmail: string, rawCode: string): Promise<string> {
  const email = normEmail(rawEmail);
  const code = rawCode.replace(/\D/g, '');
  const sb = adminClient();
  const { data } = await sb.from('login_codes').select('*').eq('email', email).maybeSingle();
  const row = data as Row | null;
  if (!row) throw new CodeError('none', 'Ask for a new code.');
  if (new Date(row.expires_at).getTime() < Date.now()) throw new CodeError('expired', 'That code has expired. Ask for a new one.');
  if (row.attempts >= MAX_ATTEMPTS) throw new CodeError('locked', 'Too many wrong tries. Ask for a new code.');
  const a = Buffer.from(hash(email, code));
  const b = Buffer.from(row.code_hash);
  if (code.length !== CODE_DIGITS || a.length !== b.length || !timingSafeEqual(a, b)) {
    await sb.from('login_codes').update({ attempts: row.attempts + 1 }).eq('email', email);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new CodeError('wrong', left > 0 ? `That code isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Ask for a new code.');
  }
  await sb.from('login_codes').delete().eq('email', email);

  // Create the account the first time (already confirmed: they just proved they own the inbox).
  const created = await sb.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already|exists|registered/i.test(created.error.message)) throw created.error;
  const link = await sb.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  return link.data.properties.hashed_token;
}
