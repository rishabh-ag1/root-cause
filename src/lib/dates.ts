/** New cases go live at 09:00 IST. */
export const RELEASE_HOUR_IST = 9;
const IST_OFFSET_MS = 5.5 * 3600_000;

/**
 * The "case day" whose case is live right now: the IST date, rolling over at 09:00 IST
 * (so 08:59 IST on the 12th still shows the 11th's case).
 */
export function caseDay(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS - RELEASE_HOUR_IST * 3600_000).toISOString().slice(0, 10);
}

/** Milliseconds until the next 09:00 IST release. */
export function msToNextRelease(nowMs: number = Date.now()): number {
  const day = 86_400_000;
  return day - ((nowMs + IST_OFFSET_MS - RELEASE_HOUR_IST * 3600_000) % day + day) % day;
}

/** Today's calendar date in India (Asia/Kolkata), as YYYY-MM-DD. */
export function istDate(at: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

const dayMs = 86_400_000;
const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

export function addDays(date: string, n: number): string {
  return new Date(toUtc(date) + n * dayMs).toISOString().slice(0, 10);
}

/** Case number = days since launch + 1. */
export function caseNumberFor(date: string, launchDate: string): number {
  return Math.round((toUtc(date) - toUtc(launchDate)) / dayMs) + 1;
}

export function publishDateFor(caseNumber: number, launchDate: string): string {
  return addDays(launchDate, caseNumber - 1);
}

export function launchDate(): string {
  const d = process.env.LAUNCH_DATE?.trim();
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('LAUNCH_DATE must be set as YYYY-MM-DD');
  return d;
}
