import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * SMTP mailer. Works with Gmail (smtp.gmail.com:465 + an app password) today and with
 * Resend/Postmark/SES SMTP later by changing env vars only.
 */
export function mailerConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transport: Transporter | null = null;
function mailer() {
  if (!mailerConfigured()) throw new Error('Email is not configured: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM.');
  const port = Number(process.env.SMTP_PORT || 465);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: true,
    maxConnections: 3,
  });
  return transport;
}

export const fromAddress = () => process.env.EMAIL_FROM || `Root Cause <${process.env.SMTP_USER}>`;

export async function sendMail(m: { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }) {
  await mailer().sendMail({ from: fromAddress(), ...m });
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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** "Case #N is live" email. Teases the brief only; never the answer. */
export function newCaseEmail(p: { caseNumber: number | null; company: string; headline: string; story: string; difficulty: string; userId: string }) {
  const play = `${siteUrl()}/?utm_source=email&utm_medium=new_case&utm_campaign=case_${p.caseNumber ?? 'x'}`;
  const unsub = unsubscribeUrl(p.userId);
  const story = p.story.length > 260 ? p.story.slice(0, 257).trimEnd() + '…' : p.story;
  const level = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' }[p.difficulty] ?? p.difficulty;
  const subject = `🕵️ Case #${p.caseNumber}: ${p.headline}`;
  const html = `<!doctype html><html><body style="margin:0;background:#e6dfcf;font-family:Helvetica,Arial,sans-serif;color:#1f2421">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-weight:700;letter-spacing:3px;font-size:14px;text-transform:uppercase;margin-bottom:12px">Root Cause</div>
  <div style="background:#fbf8f1;border:1px solid #cfc5ad;border-top:6px solid #b8322a;border-radius:4px;padding:24px">
    <div style="font-family:Menlo,Consolas,monospace;font-size:12px;letter-spacing:1px;color:#6c675b;text-transform:uppercase">Case #${p.caseNumber} · ${esc(p.company)} · ${esc(level)}</div>
    <h1 style="font-size:26px;line-height:1.15;margin:10px 0 12px">${esc(p.headline)}</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 20px">${esc(story)}</p>
    <a href="${play}" style="display:inline-block;background:#b8322a;color:#fff;text-decoration:none;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 22px;border-radius:3px">Open the case file</a>
    <p style="font-size:13px;color:#6c675b;margin:18px 0 0">Everyone gets the same case today. Fewer files, fewer wrong guesses and a faster time put you higher on the leaderboard.</p>
  </div>
  <p style="font-size:12px;color:#6c675b;margin:16px 0 0">You're getting this because you play Root Cause. <a href="${unsub}" style="color:#6c675b">Unsubscribe</a> from new-case emails.</p>
</div></body></html>`;
  const text = `Case #${p.caseNumber} is live: ${p.headline}\n\n${story}\n\nPlay: ${play}\n\nUnsubscribe from new-case emails: ${unsub}`;
  return {
    subject,
    html,
    text,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
