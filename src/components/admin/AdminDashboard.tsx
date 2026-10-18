'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminCaseRow } from '@/lib/admin';
import type { Stats } from '@/lib/adminStats';
import { addDays } from '@/lib/dates';
import { fmtClock } from '@/lib/game';
import { Blocks, Rich } from '../Blocks';
import type { Block } from '@/lib/caseSchema';

type CasesResp = { today: string; mailer: boolean; cron: boolean; cases: AdminCaseRow[] };
type Tab = 'overview' | 'schedule' | 'emails';

async function api<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & { error?: { message: string } } }> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

const LEVEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const fmtDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [cases, setCases] = useState<CasesResp | null>(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [preview, setPreview] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([api<Stats>('/api/admin/stats'), api<CasesResp>('/api/admin/cases')]);
    if (!s.ok || !c.ok) return setErr(s.data.error?.message || c.data.error?.message || 'Could not load the dashboard.');
    setStats(s.data);
    setCases(c.data);
    setErr('');
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function schedule(caseId: number, date: string | null) {
    const r = await api('/api/admin/schedule', { method: 'POST', body: JSON.stringify({ caseId, date }) });
    setToast(r.ok ? (date ? `Scheduled for ${fmtDate(date)}, live at 9am IST.` : 'Moved back to the library.') : r.data.error?.message ?? 'Failed.');
    if (r.ok) load();
  }

  async function sendEmail(caseId: number) {
    if (!confirm('Email every player that this case is live? This can only be done once per case.')) return;
    setToast('Sending…');
    const r = await api<{ sent: number; failed: number; recipients: number }>('/api/admin/email', { method: 'POST', body: JSON.stringify({ caseId }) });
    setToast(r.ok ? `Sent ${r.data.sent} of ${r.data.recipients}${r.data.failed ? ` (${r.data.failed} failed)` : ''}.` : r.data.error?.message ?? 'Failed.');
    load();
  }

  return (
    <main className="wrap admin" style={{ marginTop: 16, maxWidth: 1100 }}>
      <div className="hud" style={{ position: 'static' }}>
        <div className="brand">Admin<small>ROOT CAUSE · CASE DAY {stats?.today ?? '…'} · RELEASES AT 9AM IST</small></div>
        <div className="seg" role="tablist">
          {(['overview', 'schedule', 'emails'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-pressed={tab === t} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </div>
      {err && <div className="banner warn">{err}</div>}
      {!stats || !cases ? (
        !err && <div className="skeleton" />
      ) : tab === 'overview' ? (
        <Overview s={stats} />
      ) : tab === 'schedule' ? (
        <Schedule data={cases} onSchedule={schedule} onPreview={setPreview} />
      ) : (
        <Emails data={cases} onSend={sendEmail} />
      )}
      {preview !== null && <Preview id={preview} onClose={() => setPreview(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

// ------------------------------------------------------------------ overview

function Tile({ k, v, sub }: { k: string; v: string | number; sub?: string }) {
  return (
    <div className="tile">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function Overview({ s }: { s: Stats }) {
  const t = s.totals;
  return (
    <>
      <section className="tiles">
        <Tile k="Sign-ups" v={t.signups} sub={`${t.signupsLast7} in the last 7 days`} />
        <Tile k="Players" v={t.players} sub="started at least one case" />
        <Tile k="DAU" v={s.active.dau} sub="players today" />
        <Tile k="WAU" v={s.active.wau} sub="last 7 days" />
        <Tile k="MAU" v={s.active.mau} sub="last 30 days" />
        <Tile k="Stickiness" v={`${s.active.stickiness}%`} sub="avg DAU ÷ MAU" />
        <Tile k="Came back next case" v={`${s.retention.nextCaseReturn}%`} sub={`${s.retention.repeatPlayers} played 2+ cases`} />
        <Tile k="Solve rate" v={`${t.solveRate}%`} sub={`avg score ${t.avgScore}`} />
      </section>

      <section className="board">
        <h2>Insights <span>Generated from the database, refreshed on load</span></h2>
        <ul className="insights">
          {s.insights.map((i, n) => (
            <li key={n} className={i.tone}>{i.text}</li>
          ))}
        </ul>
      </section>

      <section className="board">
        <h2>Daily players, last 30 days <span>New vs returning · days roll over at 9am IST</span></h2>
        <DailyChart daily={s.daily} />
      </section>

      <div className="two">
        <section className="board">
          <h2>Funnel <span>Unique people</span></h2>
          <Bars rows={s.funnel.map((f) => ({ label: f.step, value: f.count }))} />
        </section>
        <section className="board">
          <h2>Retention <span>Of players of a case, how many played the next one</span></h2>
          {s.retention.pairs.length ? (
            <Bars rows={s.retention.pairs.slice(-8).map((p) => ({ label: `#${p.from} → #${p.to}`, value: p.rate, note: `${p.returned}/${p.players}` }))} max={100} suffix="%" />
          ) : (
            <p className="empty">Appears once two cases have been live.</p>
          )}
          <p className="foot">Longest current streak: {s.retention.longestStreak || '—'} · {s.retention.playersOnStreak} players on a 2+ streak</p>
        </section>
      </div>

      <section className="board">
        <h2>Cases <span>Live and past</span></h2>
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Case</th><th>Level</th><th>Players</th><th>Solved</th><th>Avg score</th><th>Avg files</th><th>≤ par</th><th>Wrong/player</th><th>Median time</th><th>Bonus ✓</th><th>Quit</th></tr>
            </thead>
            <tbody>
              {s.perCase.map((c) => (
                <tr key={c.id}>
                  <td>#{c.number} {c.company}<br /><span className="foot">{fmtDate(c.date)}</span></td>
                  <td>{LEVEL[c.difficulty] ?? c.difficulty}</td>
                  <td>{c.players}</td>
                  <td>{c.solveRate}%</td>
                  <td>{c.avgScore}</td>
                  <td>{c.avgFiles} <span className="foot">/ par {c.par}</span></td>
                  <td>{c.atOrUnderPar}%</td>
                  <td>{c.avgWrong}</td>
                  <td>{fmtClock(c.medianSeconds)}</td>
                  <td>{c.bonusCorrect}%</td>
                  <td>{c.abandoned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {s.focus && (
        <div className="two">
          <section className="board">
            <h2>#{s.focus.number}: files opened <span>{s.focus.players} players</span></h2>
            <Bars rows={s.focus.files.map((f) => ({ label: f.title, value: f.rate, note: f.first ? `${f.first} opened it first` : '' }))} max={100} suffix="%" />
          </section>
          <section className="board">
            <h2>#{s.focus.number}: wrong answers <span>Share of players who picked each</span></h2>
            {s.focus.wrongCauses.length ? (
              <Bars rows={s.focus.wrongCauses.map((w) => ({ label: w.label, value: w.rate }))} max={100} suffix="%" tone="stamp" />
            ) : (
              <p className="empty">No wrong accusations yet.</p>
            )}
            <p className="foot">Answer: {s.focus.answer}</p>
          </section>
        </div>
      )}
    </>
  );
}

function Bars({ rows, max, suffix = '', tone = 'ink' }: { rows: { label: string; value: number; note?: string }[]; max?: number; suffix?: string; tone?: 'ink' | 'stamp' }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div key={i} className="bar">
          <div className="bar-label"><span>{r.label}</span><b>{r.value}{suffix}</b></div>
          <div className="bar-track"><div className={'bar-fill ' + tone} style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%` }} /></div>
          {r.note && <span className="foot">{r.note}</span>}
        </div>
      ))}
    </div>
  );
}

function DailyChart({ daily }: { daily: Stats['daily'] }) {
  const W = 900, H = 200, P = 26;
  const max = Math.max(4, ...daily.map((d) => Math.max(d.players, d.signups)));
  const bw = (W - P * 2) / daily.length;
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const signupLine = daily.map((d, i) => `${P + i * bw + bw / 2},${y(d.signups)}`).join(' ');
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily players and sign-ups">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={2} y={y(max * f) + 4} className="axis">{Math.round(max * f)}</text>
          </g>
        ))}
        {daily.map((d, i) => (
          <g key={d.day}>
            <title>{`${fmtDate(d.day)}: ${d.players} players (${d.newPlayers} new, ${d.returning} returning), ${d.signups} sign-ups`}</title>
            <rect x={P + i * bw + 2} width={bw - 4} y={y(d.returning)} height={H - P - y(d.returning)} className="b-ret" />
            <rect x={P + i * bw + 2} width={bw - 4} y={y(d.players)} height={y(d.returning) - y(d.players)} className="b-new" />
            {i % 5 === 4 && <text x={P + i * bw + bw / 2} y={H - 6} className="axis" textAnchor="middle">{d.day.slice(5)}</text>}
          </g>
        ))}
        <polyline points={signupLine} className="l-sign" />
      </svg>
      <div className="legend"><span className="lg-new">New players</span><span className="lg-ret">Returning players</span><span className="lg-sign">Sign-ups</span></div>
    </div>
  );
}

// ------------------------------------------------------------------ schedule

function Schedule({ data, onSchedule, onPreview }: { data: CasesResp; onSchedule: (id: number, date: string | null) => void; onPreview: (id: number) => void }) {
  const [filter, setFilter] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const byDate = useMemo(() => new Map(data.cases.filter((c) => c.publish_date && c.status !== 'draft').map((c) => [c.publish_date!, c])), [data.cases]);
  const library = data.cases.filter((c) => c.state === 'library' && (filter === 'all' || c.difficulty === filter));
  const days = Array.from({ length: 21 }, (_, i) => addDays(data.today, i));
  const past = data.cases.filter((c) => c.state === 'past').sort((a, b) => (b.publish_date ?? '').localeCompare(a.publish_date ?? ''));
  const firstEmpty = days.find((d) => !byDate.has(d) && d > data.today);

  return (
    <>
      <section className="board">
        <h2>Next 3 weeks <span>Each date goes live at 9:00 IST · {library.length} case{library.length === 1 ? '' : 's'} in the library</span></h2>
        <div className="cal">
          {days.map((d) => {
            const c = byDate.get(d);
            const isToday = d === data.today;
            return (
              <div key={d} className={'slot' + (c ? ' filled' : '') + (isToday ? ' today' : '')}>
                <div className="slot-date">{fmtDate(d)}{isToday && ' · live now'}</div>
                {c ? (
                  <>
                    <b>#{c.case_number} {c.company}</b>
                    <span className={'pill ' + c.difficulty}>{LEVEL[c.difficulty] ?? c.difficulty}</span>
                    <div className="slot-actions">
                      <button className="linkbtn" onClick={() => onPreview(c.id)}>Preview</button>
                      {c.state === 'scheduled' && c.attempts === 0 && <button className="linkbtn" onClick={() => onSchedule(c.id, null)}>Unschedule</button>}
                    </div>
                  </>
                ) : (
                  <span className="foot">{isToday ? 'No new case today' : 'Empty'}</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="board">
        <h2>
          Library <span>Unscheduled cases</span>
        </h2>
        <div className="seg" role="group" aria-label="Difficulty">
          {(['all', 'easy', 'medium', 'hard'] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : LEVEL[f]}</button>
          ))}
        </div>
        {library.length === 0 ? (
          <p className="empty">Nothing here. Add case files to <code>cases/</code> and run <code>npm run seed-cases</code>.</p>
        ) : (
          <div className="lib">
            {library.map((c) => (
              <LibraryCard key={c.id} c={c} min={data.today} suggested={firstEmpty} taken={byDate} onSchedule={onSchedule} onPreview={onPreview} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="board">
          <h2>Already live <span>Dates are locked once a case goes live</span></h2>
          <div className="tbl">
            <table>
              <tbody>
                {past.map((c) => (
                  <tr key={c.id}>
                    <td>#{c.case_number} {c.title}</td>
                    <td>{c.company}</td>
                    <td>{LEVEL[c.difficulty] ?? c.difficulty}</td>
                    <td>{c.publish_date && fmtDate(c.publish_date)}</td>
                    <td>{c.attempts} plays</td>
                    <td><button className="linkbtn" onClick={() => onPreview(c.id)}>Preview</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function LibraryCard({ c, min, suggested, taken, onSchedule, onPreview }: { c: AdminCaseRow; min: string; suggested?: string; taken: Map<string, AdminCaseRow>; onSchedule: (id: number, d: string) => void; onPreview: (id: number) => void }) {
  const [date, setDate] = useState(suggested ?? addDays(min, 1));
  const clash = taken.get(date);
  return (
    <div className="libcard">
      <div className="libcard-top">
        <span className={'pill ' + c.difficulty}>{LEVEL[c.difficulty] ?? c.difficulty}</span>
        <span className="foot">{c.files} files · {c.causes} causes · par {c.par}</span>
      </div>
      <b>{c.company}</b>
      <p className="foot" style={{ color: 'var(--ink)' }}>{c.title}</p>
      <div className="accuse-row" style={{ gap: 8 }}>
        <input type="date" className="date" value={date} min={min} onChange={(e) => setDate(e.target.value)} aria-label="Publish date" />
        <button className="btn primary small" disabled={!!clash || !date} onClick={() => onSchedule(c.id, date)}>Schedule</button>
        <button className="btn ghost small" onClick={() => onPreview(c.id)}>Preview</button>
      </div>
      {clash && <span className="err">{fmtDate(date)} already has #{clash.case_number} {clash.company}.</span>}
    </div>
  );
}

type FullCase = {
  id: number; title: string; company: string; difficulty: string; par: number; publish_date: string | null; case_number: number | null;
  brief: { headline: string; story: string; facts: { label: string; value: string }[]; units_note?: string };
  evidence: { title: string; teaser: string; body: Block[] }[];
  causes: { label: string; feedback: string | null }[];
  answer_index: number;
  bonus: { question: string; options: string[]; answer_index: number; explanation: string };
  explanation: { answer: string; cash_bridge?: string; why?: string[]; fastest_path: string[]; traps: string | string[]; fix?: string; lesson?: string };
};

function Preview({ id, onClose }: { id: number; onClose: () => void }) {
  const [c, setC] = useState<FullCase | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    api<FullCase>('/api/admin/case?id=' + id).then((r) => r.ok && setC(r.data));
  }, [id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const traps = c ? (Array.isArray(c.explanation.traps) ? c.explanation.traps : [c.explanation.traps]) : [];
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet preview" role="dialog" aria-modal="true">
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        {!c ? (
          <div className="skeleton" />
        ) : (
          <>
            <div className="tag">{c.company} · {LEVEL[c.difficulty] ?? c.difficulty} · par {c.par}{c.publish_date ? ` · #${c.case_number} on ${fmtDate(c.publish_date)}` : ' · unscheduled'}</div>
            <h3>{c.brief.headline}</h3>
            <p>{c.brief.story}</p>
            <div className="facts">{c.brief.facts.map((f, i) => <span key={i} className="fact">{f.label} <b>{f.value}</b></span>)}</div>
            <h2>Evidence</h2>
            {c.evidence.map((e, i) => (
              <div key={i} className={'card' + (open === i ? ' open' : '')}>
                <div className="card-top">
                  <span className="num">{String(i + 1).padStart(2, '0')}</span>
                  <div className="card-title"><b>{e.title}</b><i>{e.teaser}</i></div>
                  <button className="openbtn" onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Close' : 'Open'}</button>
                </div>
                {open === i && <div className="card-body"><Blocks blocks={e.body} /></div>}
              </div>
            ))}
            <div className="explain">
              <p><b>Answer:</b> {c.causes[c.answer_index].label}</p>
              <p><Rich text={c.explanation.answer} /></p>
              {c.explanation.cash_bridge && <p><b>Bridge:</b> {c.explanation.cash_bridge}</p>}
              <p><b>Par path:</b></p>
              <ol>{c.explanation.fastest_path.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ol>
              <p><b>Traps:</b></p>
              <ul>{traps.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul>
              <p><b>Bonus:</b> {c.bonus.question} → {c.bonus.options[c.bonus.answer_index]}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ emails

function Emails({ data, onSend }: { data: CasesResp; onSend: (id: number) => void }) {
  const live = data.cases.filter((c) => c.state === 'live' || c.state === 'past').sort((a, b) => (b.publish_date ?? '').localeCompare(a.publish_date ?? ''));
  const today = data.cases.find((c) => c.state === 'live');
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  async function sendTest() {
    setTesting(true);
    const r = await api<{ to: string; from: string }>('/api/admin/email/test', { method: 'POST' });
    setTesting(false);
    setTest(r.ok ? { ok: true, text: `Sent to ${r.data.to} from ${r.data.from}. Check your inbox (and spam).` } : { ok: false, text: r.data.error?.message ?? 'Failed.' });
  }
  return (
    <>
      <section className="board">
        <h2>Setup <span>New-case emails go out automatically at 9:00 IST</span></h2>
        <div className="accuse-row">
          <button className="btn ghost small" onClick={sendTest} disabled={testing}>{testing ? 'Sending…' : 'Send me a test email'}</button>
          {test && <span className={test.ok ? 'copied' : 'err'} style={{ fontSize: 13 }}>{test.text}</span>}
        </div>
        <ul className="insights">
          <li className={data.mailer ? 'good' : 'warn'}>{data.mailer ? 'Email sending is configured (SMTP).' : 'Email sending is not configured: add the SMTP_* settings in Vercel.'}</li>
          <li className={data.cron ? 'good' : 'warn'}>{data.cron ? 'The 9am job is configured (CRON_SECRET set).' : 'The 9am job is not set up yet: add CRON_SECRET in Vercel.'}</li>
          <li className="info">Players who unsubscribed (link in every email, or the toggle on the Account page) are skipped. Each case is emailed at most once.</li>
        </ul>
        {today && !today.email && (
          <div className="accuse-row" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={!data.mailer} onClick={() => onSend(today.id)}>Send today&apos;s email now</button>
            <span className="foot">#{today.case_number} {today.company} is live and hasn&apos;t been emailed.</span>
          </div>
        )}
      </section>
      <section className="board">
        <h2>Send log</h2>
        <div className="tbl">
          <table>
            <thead><tr><th>Case</th><th>Live on</th><th>Recipients</th><th>Sent</th><th>Failed</th><th>Finished</th></tr></thead>
            <tbody>
              {live.map((c) => (
                <tr key={c.id}>
                  <td>#{c.case_number} {c.company}</td>
                  <td>{c.publish_date && fmtDate(c.publish_date)}</td>
                  <td>{c.email?.recipients ?? '—'}</td>
                  <td>{c.email?.sent ?? '—'}</td>
                  <td>{c.email?.failed ?? '—'}</td>
                  <td>{c.email?.finished_at ? new Date(c.email.finished_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : c.email ? 'in progress' : 'not sent'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
