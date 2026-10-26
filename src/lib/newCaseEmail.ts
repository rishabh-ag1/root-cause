import 'server-only';
import { siteUrl, unsubscribeUrl } from './email';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const LEVEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

/** The first couple of sentences of the brief: enough to hook, never the whole story (and never the answer). */
function teaser(story: string, max = 220) {
  const sentences = story.match(/[^.!?]+[.!?]+/g) ?? [story];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > max && out) break;
    out += s;
  }
  out = out.trim();
  return out.length > max + 40 ? out.slice(0, max).trimEnd() + '…' : out;
}

export type NewCaseEmailInput = {
  userId: string;
  username: string | null;
  caseNumber: number | null;
  company: string;
  difficulty: string;
  headline: string;
  story: string;
  facts: { label: string; value: string }[];
  /** How yesterday went, for social proof. */
  previous: { company: string; players: number; topScore: number | null; topPlayer: string | null } | null;
  /** This player's habit so far. */
  me: { streak: number; played: number; title: string; next: string | null; toNext: number } | null;
};

/**
 * "A new case is live" email. Built to get opened and clicked: the case headline as the subject,
 * a short teaser, the key numbers, one big button, the leaderboard race, and the player's streak.
 */
export function newCaseEmail(p: NewCaseEmailInput) {
  const n = p.caseNumber ?? '';
  const play = `${siteUrl()}/?utm_source=email&utm_medium=new_case&utm_campaign=case_${n || 'x'}`;
  const board = `${siteUrl()}/leaderboard?utm_source=email&utm_medium=new_case`;
  const unsub = unsubscribeUrl(p.userId);
  const level = LEVEL[p.difficulty] ?? p.difficulty;
  const hook = teaser(p.story);
  const facts = p.facts.slice(0, 3);

  const subject = `Case #${n} is live: ${p.headline}`;
  const preheader = `${p.company} has a problem. Takes about 3 minutes. Can you crack it before everyone else?`;
  const hello = p.username ? `Hi ${p.username},` : 'Hi detective,';

  const prevLine = p.previous && p.previous.players > 0
    ? `Yesterday ${p.previous.players} ${p.previous.players === 1 ? 'detective' : 'detectives'} took on ${p.previous.company}${p.previous.topScore !== null ? `. Top score: <b>${p.previous.topScore}</b>${p.previous.topPlayer ? ` by @${esc(p.previous.topPlayer)}` : ''}` : ''}.`
    : '';
  const prevText = prevLine.replace(/<[^>]+>/g, '');

  let habit: string;
  if (p.me && p.me.streak > 1) habit = `You're on a <b>${p.me.streak}-day streak</b>. Play today to keep it alive.`;
  else if (p.me && p.me.streak === 1) habit = `You played yesterday. Play today to start a <b>2-day streak</b>.`;
  else if (p.me && p.me.played > 0) habit = `You've cracked ${p.me.played} ${p.me.played === 1 ? 'case' : 'cases'} so far. Start a new streak today.`;
  else habit = `Your first case is waiting. It takes about three minutes.`;
  if (p.me?.next && p.me.toNext > 0) habit += ` You're <b>${p.me.toNext.toLocaleString('en-IN')} points</b> away from ${esc(p.me.next)}.`;
  const habitText = habit.replace(/<[^>]+>/g, '');

  const factsHtml = facts.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0 4px">
        <tr>${facts
          .map(
            (f, i) => `<td valign="top" style="padding:10px 12px;background:#f3eee2;${i ? 'border-left:2px solid #fbf8f1;' : ''}">
              <div style="font-size:11px;color:#6c675b;text-transform:uppercase;letter-spacing:1px">${esc(f.label)}</div>
              <div style="font-family:Menlo,Consolas,monospace;font-size:14px;font-weight:700;margin-top:3px">${esc(f.value)}</div>
            </td>`,
          )
          .join('')}</tr>
      </table>`
    : '';

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#e6dfcf;font-family:Helvetica,Arial,sans-serif;color:#1f2421">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;</div>
<div style="max-width:560px;margin:0 auto;padding:24px 14px">
  <div style="text-align:center;margin-bottom:16px">
    <span style="display:inline-block;width:34px;height:34px;line-height:31px;border:2px solid #b8322a;border-radius:50%;color:#b8322a;font-weight:700;font-size:13px">RC</span>
    <div style="font-weight:700;letter-spacing:4px;font-size:13px;text-transform:uppercase;margin-top:6px">Root Cause</div>
  </div>
  <div style="background:#fbf8f1;border-radius:10px;overflow:hidden;border:1px solid #d8ccb0">
    <div style="background:#b8322a;color:#fff;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:10px 22px">New case is live · #${n} · ${esc(level)}</div>
    <div style="padding:22px">
      <p style="margin:0 0 14px;font-size:15px">${esc(hello)}</p>
      <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#b8322a">${esc(p.company)}</div>
      <h1 style="font-size:26px;line-height:1.15;margin:6px 0 12px;font-weight:800">${esc(p.headline)}</h1>
      <p style="font-size:15.5px;line-height:1.6;margin:0">${esc(hook)} <b>Something doesn't add up, and the clues are in the files.</b></p>
      ${factsHtml}
      <div style="text-align:center;margin:24px 0 8px">
        <a href="${play}" style="display:inline-block;background:#b8322a;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;letter-spacing:1px;padding:15px 34px;border-radius:999px">Crack the case &rarr;</a>
      </div>
      <p style="text-align:center;font-size:13px;color:#6c675b;margin:0">About 3 minutes · Same case for everyone</p>
    </div>
    <div style="border-top:1px solid #e3dac4;padding:18px 22px;background:#f7f2e7">
      <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px">Where will you rank today?</div>
      <p style="font-size:14px;line-height:1.55;margin:0 0 8px">${prevLine ? prevLine + ' ' : ''}Today's leaderboard is still empty. Open fewer clues, guess right first time, and your name could be at the top. <a href="${board}" style="color:#1f2421">See the leaderboard</a></p>
      <p style="font-size:14px;line-height:1.55;margin:0">${habit}</p>
    </div>
  </div>
  <p style="font-size:13px;line-height:1.55;color:#4a4a40;text-align:center;margin:18px 8px 0">A new business mystery drops every morning at 9. A few minutes a day is all it takes to start thinking like a CEO.</p>
  <p style="font-size:12px;color:#8a8576;text-align:center;margin:16px 0 0">You're getting this because you play Root Cause. <a href="${unsub}" style="color:#8a8576">Unsubscribe</a></p>
</div></body></html>`;

  const text = [
    `${hello}`,
    '',
    `A new case is live: #${n} · ${p.company} · ${level}`,
    '',
    p.headline,
    '',
    `${hook} Something doesn't add up, and the clues are in the files.`,
    facts.length ? '\n' + facts.map((f) => `${f.label}: ${f.value}`).join('\n') : '',
    '',
    `Crack the case: ${play}`,
    '',
    `Where will you rank today? ${prevText ? prevText + ' ' : ''}Today's leaderboard is still empty.`,
    habitText,
    '',
    'A new business mystery drops every morning at 9.',
    '',
    `Unsubscribe: ${unsub}`,
  ].join('\n');

  return {
    subject,
    html,
    text,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
