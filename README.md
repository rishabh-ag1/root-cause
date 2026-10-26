# Root Cause

A daily business detective game. One case a day: a business has a problem, the cause is hidden in sealed evidence files, and players open as few files as possible before naming the root cause. Everyone gets the same case, plays once, and lands on a global leaderboard.

**Stack:** Next.js 15 (App Router, TypeScript) on Vercel · Supabase (Postgres + email OTP auth) · zod · vitest.

## How it's built

- **The answer never reaches the browser early.** `GET /api/case/today` returns only the brief, file titles, cause labels and par. A file's body is sent only when the player opens it (`POST /api/attempt/open`). Cause feedback, the answer, the bonus answer and the explanation are sent only once the attempt is finished. Covered by `tests/leakage.test.ts`.
- **All scoring is server-side**, in pure functions in `src/lib/game.ts` (`applyOpen`, `applyAccuse`, `applyBonus`, `computeScore`). The client only displays results. The same functions power the local practice replay once your ranked attempt is over.
- **One ranked attempt per account per case** is enforced by `unique (user_id, case_id)` on `attempts`. Concurrent requests are guarded by a `rev` column (optimistic locking).
- **The clock** starts at the server timestamp of the first file opened or first accusation. A correct accusation ends the attempt and locks the score.
- **The bonus question is just for fun.** It is asked after solving, one try, and never changes the score or the leaderboard.
- **New cases go live at 09:00 IST.** The live case is the latest scheduled case whose date is on or before the current "case day" (the IST date, rolling over at 9am). Case number = days since `LAUNCH_DATE` + 1, assigned when the admin schedules it.
- RLS is on for every table. `cases` has no policies, so only the service role (server) can read it. Leaderboard SQL functions are executable by the service role only.

```
cases/                     one JSON file per case (NNN-slug.json)
scripts/validate-cases.ts  schema + totals reconciliation + feedback checks
scripts/seed-cases.ts      upserts valid cases into Supabase
supabase/migrations/       schema, RLS, leaderboard functions
src/lib/game.ts            rules, scoring, state transitions, share text, public views
src/lib/repo.ts            database access (service role)
src/app/api/...            route handlers
src/components/Game.tsx    the Today screen
```

## Environment variables

| Name | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key. **Server only, never expose.** |
| `LAUNCH_DATE` | IST date of Case #1, `YYYY-MM-DD` |
| `NEXT_PUBLIC_SITE_URL` | e.g. `https://rootcause.in` (used in share text and OG tags) |
| `CRON_SECRET` | Any long random string. Vercel Cron sends it to `/api/cron/release` at 09:00 IST. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Mail server for new-case emails. Gmail: `smtp.gmail.com`, `465`, your address, a 16-character [app password](https://myaccount.google.com/apppasswords). Resend: `smtp.resend.com`, `465`, `resend`, your API key. |
| `EMAIL_FROM` | e.g. `Root Cause <you@gmail.com>` (Gmail always sends from the signed-in address). The same SMTP settings also send the 4-digit sign-in codes; without them, sign-in falls back to Supabase's 6-digit email code. |
| `NEXT_PUBLIC_GA_ID` | Optional. Overrides the built-in Google Analytics 4 Measurement ID (`G-255ZVL3F5V`). GA4 loads on production pages and receives the same game events as PostHog. |
| `NEXT_PUBLIC_CLARITY_ID` | Optional. Overrides the built-in Microsoft Clarity project ID (`yw291uw8mq`). Clarity only loads on production builds. |

Copy `.env.example` to `.env.local` and fill it in.

## First-time setup

1. **Supabase project.** Create a project (region: Mumbai `ap-south-1`).
2. **Schema.** SQL Editor → paste and run `supabase/migrations/0001_init.sql`. (Or with the Supabase CLI: `supabase link` then `supabase db push`.)
3. **Email codes.** Authentication → Sign In / Providers → Email: enabled. Then Authentication → Emails → *Magic Link* template: replace the body with something that includes the 6-digit code, e.g.
   ```html
   <h2>Your Root Cause code</h2>
   <p>Enter this code to sign in: <strong style="font-size:24px;letter-spacing:4px">{{ .Token }}</strong></p>
   <p>It expires in 1 hour. If you didn't ask for it, ignore this email.</p>
   ```
   Supabase's built-in mailer is rate-limited (a few emails an hour). Before launch, add a custom SMTP provider (Resend, Postmark, SES) under Authentication → Emails → SMTP Settings.
4. **Seed cases.** `npm install`, then `npm run validate-cases` and `npm run seed-cases`.
5. **Run locally.** `npm run dev`, then open http://localhost:3000. `/dev/preview` shows Case #1 without a database (dev only).

## Deploy (Vercel)

1. Import the GitHub repo in Vercel (framework: Next.js, no build settings needed).
2. Add the five env vars above for Production (and Preview).
3. Deploy. In Supabase → Authentication → URL Configuration, set the Site URL to your Vercel/production URL.

## Admin dashboard (`/admin`)

Admins are flagged in the database: `update profiles set is_admin = true where id = '<user id>'`. The Account page shows an **Admin dashboard** button for them. For local development, `DEV_ADMIN_BYPASS=1 npm run dev` opens `/admin` without signing in (ignored in production).

- **Overview:** DAU/WAU/MAU, stickiness, next-case retention, streaks, the sign-up → solve funnel, a 30-day chart of new vs returning players, per-case stats (solve rate, score, files vs par, time, bonus accuracy, quits), which files players open and which wrong answers they pick, plus plain-language insights. Everything is computed from the database on load; no emails or usernames are returned.
- **Schedule:** a 3-week calendar and the case library. Pick a date and press Schedule; the case goes live at 09:00 IST that day and gets its case number then. Unschedule sends it back to the library. Dates lock once a case is live or has been played, and only one case can sit on each date.
- **Emails:** whether email and the 9am job are configured, a send log, and a manual "send now" for today's case.

## New-case emails

Every minute, Supabase's scheduler (pg_cron + pg_net, migration 0006) calls `/api/cron/release` with the `CRON_SECRET` stored in Vault; Vercel Cron also calls it daily at 03:30 UTC as a backup. If a case went live today (at 09:00 IST, or when an admin schedules a case for today), every player who has signed in and hasn't unsubscribed gets one email within about a minute (the case headline as the subject, a short teaser, a "Crack the case" button, yesterday's top score, and the player's streak). Admin → Emails → "Send me a preview" emails you the next one first. Each case is emailed at most once (`case_emails` row), so retries never double-send. Every email has a signed one-click unsubscribe link; players can also toggle it on the Account page.

Gmail limits a personal account to about 500 emails a day. Move to Resend on your own domain before that matters.

## Add a new case

1. Copy any file in `cases/` to `cases/your-slug.json`. The file name is the case's permanent id. Don't set `case_number` or `publish_date`; you choose the date in `/admin`.
2. Write the brief, evidence (structured `table` / `note` / `quote` blocks), causes (feedback for every wrong one), `answer_index`, bonus question, explanation and par. Follow the content rules in `SPEC.md` §7: one cause explains ≥90% of the gap, at least two traps, par is reachable, fictional Indian companies, original content only.
3. Tables use `columns`, `rows` and an optional `total` row. Write negatives in brackets, e.g. `(152)`. For a total that should reconcile, add `"sum_check": { "columns": [1, 2] }`.
4. `npm run validate-cases`, then `npm run seed-cases`. New cases land in the admin library as drafts; re-running only refreshes their content and never changes dates you set.

## Scripts

| | |
|---|---|
| `npm run dev` | local dev server |
| `npm test` | vitest: scoring, transitions, leakage, case validation |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate-cases` | validate every file in `cases/` |
| `npm run seed-cases` | upsert cases into Supabase (reads `.env.local`) |

## Analytics (Microsoft Clarity)

Clarity loads on every production page (project `yw291uw8mq`). Besides recordings and heatmaps, the app sends these custom events (filter recordings or build funnels with them in Clarity):

`signin_prompt` → `signin_code_sent` → `signin_verified` → `username_set` · `file_open` and `file_open_N` (which of the files) · `accuse_wrong` · `case_solved` / `case_unsolved` · `bonus_correct` / `bonus_wrong` · `share_copy` / `share_native` · `practice_start`.

Tags: `case`, `signed_in`, `played_today`, `result`, `files_opened`. The sign-in sheet is masked, so emails and codes are never recorded.

## Not in v1 (Phase 2)

Daily 9am result email (Resend), streaks, archive (`/case/N`), college/company leagues. The rate limiter is per-instance in memory; move it to Upstash/Redis if abuse appears.
