# Root Cause

A daily business detective game. One case a day: a business has a problem, the cause is hidden in sealed evidence files, and players open as few files as possible before naming the root cause. Everyone gets the same case, plays once, and lands on a global leaderboard.

**Stack:** Next.js 15 (App Router, TypeScript) on Vercel · Supabase (Postgres + email OTP auth) · zod · vitest.

## How it's built

- **The answer never reaches the browser early.** `GET /api/case/today` returns only the brief, file titles, cause labels and par. A file's body is sent only when the player opens it (`POST /api/attempt/open`). Cause feedback, the answer, the bonus answer and the explanation are sent only once the attempt is finished. Covered by `tests/leakage.test.ts`.
- **All scoring is server-side**, in pure functions in `src/lib/game.ts` (`applyOpen`, `applyAccuse`, `applyBonus`, `computeScore`). The client only displays results. The same functions power the local practice replay once your ranked attempt is over.
- **One ranked attempt per account per case** is enforced by `unique (user_id, case_id)` on `attempts`. Concurrent requests are guarded by a `rev` column (optimistic locking).
- **The clock** starts at the server timestamp of the first file opened or first accusation. A correct accusation ends the attempt and locks the score.
- **The bonus question is just for fun.** It is asked after solving, one try, and never changes the score or the leaderboard.
- **Cases roll over at 00:00 IST.** Case number = days since `LAUNCH_DATE` + 1.
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

## Add a new case

1. Copy `cases/001-saltwater-labs.json` to `cases/NNN-your-slug.json` (`NNN` = case number, zero-padded). It publishes on `LAUNCH_DATE + NNN − 1`.
2. Write the brief, evidence (structured `table` / `note` / `quote` blocks), causes (feedback for every wrong one), `answer_index`, bonus question, explanation and par. Follow the content rules in `SPEC.md` §7: one cause explains ≥90% of the gap, at least two traps, par is reachable, fictional Indian companies, original content only.
3. Tables use `columns`, `rows` and an optional `total` row. Write negatives in brackets, e.g. `(152)`. For a total that should reconcile, add `"sum_check": { "columns": [1, 2] }`.
4. `npm run validate-cases`, then `npm run seed-cases`.
5. Use `"status": "draft"` to keep a case hidden.

## Scripts

| | |
|---|---|
| `npm run dev` | local dev server |
| `npm test` | vitest: scoring, transitions, leakage, case validation |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run validate-cases` | validate every file in `cases/` |
| `npm run seed-cases` | upsert cases into Supabase (reads `.env.local`) |

## Not in v1 (Phase 2)

Daily 9am result email (Resend), streaks, archive (`/case/N`), college/company leagues. The rate limiter is per-instance in memory; move it to Upstash/Redis if abuse appears.
