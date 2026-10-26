import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * SMTP mailer. Works with Gmail (smtp.gmail.com:465 + an app password) today and with
 * Resend/Postmark/SES SMTP later by changing env vars only.
 */
/** Env values pasted into dashboards often carry stray spaces or quotes; strip them. */
const clean = (v: string | undefined) => (v ?? '').trim().replace(/^["']|["']$/g, '').trim();
const smtp = () => ({
  host: clean(process.env.SMTP_HOST),
  port: Number(clean(process.env.SMTP_PORT) || 465),
  user: clean(process.env.SMTP_USER),
  // Gmail shows app passwords as "abcd efgh ijkl mnop"; the spaces aren't part of it.
  pass: clean(process.env.SMTP_PASS).replace(/\s+/g, ''),
});

export function mailerConfigured() {
  const s = smtp();
  return !!(s.host && s.user && s.pass);
}

let transport: Transporter | null = null;
function mailer() {
  if (!mailerConfigured()) throw new Error('Email is not configured: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM.');
  const s = smtp();
  transport ??= nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transport;
}

export const fromAddress = () => clean(process.env.EMAIL_FROM) || `Root Cause <${smtp().user}>`;

export async function sendMail(m: { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }) {
  try {
    await mailer().sendMail({ from: fromAddress(), ...m });
  } catch (e) {
    transport = null; // don't reuse a broken connection
    throw e;
  }
}

/** A readable reason for an SMTP failure, safe to show to admins (never includes the password). */
export function smtpErrorHint(e: unknown) {
  const err = e as { code?: string; responseCode?: number; response?: string; message?: string };
  const raw = `${err.code ?? ''} ${err.responseCode ?? ''} ${err.response ?? err.message ?? ''}`.trim();
  if (err.code === 'EAUTH' || err.responseCode === 535)
    return `Gmail rejected the login (${raw.slice(0, 120)}). Check SMTP_USER is the full Gmail address and SMTP_PASS is a 16-character app password from myaccount.google.com/apppasswords (2-Step Verification must be on).`;
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET')
    return `Couldn't connect to the mail server (${raw.slice(0, 120)}). Check SMTP_HOST is smtp.gmail.com and SMTP_PORT is 465.`;
  if (err.code === 'EENVELOPE') return `The sender or recipient address was rejected (${raw.slice(0, 120)}). Check EMAIL_FROM.`;
  return raw.slice(0, 240) || 'Unknown email error.';
}

/** The public site origin, e.g. https://playrootcause.vercel.app */
export function siteUrl() {
  const u = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://playrootcause.vercel.app');
  return u.replace(/\/$/, '');
}

// ---- unsubscribe links: an HMAC of the user id, so links can't be forged for other people
const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function unsubscribeToken(userId: string) {
  return createHmac('sha256', secret()).update('unsub:' + userId).digest('base64url');
}

export function verifyUnsubscribe(userId: string, token: string) {
  const a = Buffer.from(unsubscribeToken(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const unsubscribeUrl = (userId: string) => `${siteUrl()}/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;

