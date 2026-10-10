# Root Cause - Build Spec

A daily business detective game. Every day there is one case: a business has a problem, the cause is hidden in sealed evidence files, and players open as few files as possible before naming the root cause. Everyone gets the same case on the same day, plays once, and lands on a global leaderboard.

`prototype.html` (in the repo root) is the working single-file prototype. Treat it as the source of truth for gameplay, copy, look and feel, and Case #1 content. The production build moves scoring and answers to the server, adds accounts, and adds a leaderboard.

---

## 1. Non-negotiables

1. **The answer never reaches the browser before the attempt ends.** Evidence bodies are sent one at a time, only when a player opens that file. Cause feedback and the explanation come from the server. Anyone who views source or the network tab must learn nothing extra.
2. **All scoring happens on the server.** The client only displays it.
3. **One ranked attempt per account per case**, enforced by a database unique constraint, not just UI.
4. **The daily case rolls over at 00:00 IST (Asia/Kolkata).** Case number = days since launch + 1.
5. **Mobile first.** Most players will open it from a LinkedIn or WhatsApp link on their phone.

## 2. Stack (decided, don't re-litigate)

- **Next.js 15 (App Router) + TypeScript**, deployed on **Vercel**
- **Supabase**: Postgres + Auth (email one-time code / magic link)
- Plain CSS (CSS Modules or a global stylesheet) ported from the prototype. Keep its fonts (Oswald, IBM Plex Sans, IBM Plex Mono), palette tokens and light/dark handling.
- `zod` for request validation
- `vitest` for scoring and case-validation tests
- GitHub repo `root-cause` (private to start), created with `gh repo create`

## 3. Accounts and login

- **Sign in with email one-time code** (Supabase Auth email OTP). No passwords.
- After first sign-in, the player picks a **username** (3-20 chars, letters/numbers/underscore, unique, case-insensitive; basic profanity blocklist). The username is what appears on the leaderboard. Email is never shown publicly.
- **Phone number: optional field, off by default.** Do not make it required. (Reason: every required field cuts sign-ups, and phone numbers add data-protection obligations under India's DPDP Act. Add it later only if WhatsApp rank alerts ship.)
- **Let people read the brief before logging in.** The login prompt appears when they tap their first evidence file. The brief is the hook; don't put a wall in front of it.
- Show a short privacy notice at sign-up: what we store (email, username, game results), why (leaderboard, daily result email), and that they can delete their account. Add a "Delete my account" action in settings.

## 4. Gameplay rules (server-enforced)

| Rule | Value |
|---|---|
| Starting points | 1000 |
| Open an evidence file | −75 |
| Wrong accusation | −250 |
| Accusations allowed | 3 (3rd wrong = case unsolved, score 0) |
| Time penalty | −1 per 3 seconds, capped at −150 |
| Clock starts | Server timestamp of the first file opened (or first accusation, whichever comes first) |
| Bonus question (see §7) | +150 if correct, asked only after a correct accusation, one try |

`score = max(0, 1000 − 75·files − 250·wrong − min(150, floor(seconds/3))) + bonus` if solved, else 0.

**Leaderboard order:** score desc, then elapsed time asc, then finished_at asc.

Each case has a **par** (the minimum files an expert needs). Show "par", "+2 over par" etc. on the result, the same as the prototype.

## 5. Data model (Supabase / Postgres)

```sql
profiles (
  id uuid primary key references auth.users on delete cascade,
  username citext unique not null,
  phone text null,
  created_at timestamptz default now()
)

cases (
  id serial primary key,
  case_number int unique not null,
  publish_date date unique not null,          -- IST date
  difficulty text not null,                    -- 'mon'..'sun' tier, see §7
  title text not null,
  company text not null,
  brief jsonb not null,                        -- headline, story, facts[]
  evidence jsonb not null,                     -- [{title, teaser, body}] body = structured blocks
  causes jsonb not null,                       -- [{label, feedback}] feedback for wrong picks
  answer_index int not null,
  bonus jsonb not null,                        -- {question, options[], answer_index}
  explanation jsonb not null,                  -- answer, fastest path, traps, fix
  par int not null,
  status text not null default 'draft'         -- draft | scheduled | live
)

attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  case_id int not null references cases,
  started_at timestamptz,
  opened int[] not null default '{}',          -- in open order
  wrong int[] not null default '{}',
  solved boolean,
  bonus_correct boolean,
  finished_at timestamptz,
  score int,
  unique (user_id, case_id)
)
```

- RLS on: `cases` has **no** select policy for `anon`/`authenticated`. All case reads go through server route handlers using the service role key, which strip `body`, `feedback`, `answer_index`, `bonus.answer_index` and `explanation` as appropriate.
- `attempts`: users may select their own rows. All writes happen server-side only.
- A `leaderboard_daily` view (or SQL function) returning rank, username, score, files, wrong count, elapsed seconds for a given case.

## 6. API (Next.js route handlers)

| Route | What it does |
|---|---|
| `GET /api/case/today` | Public brief, facts, file titles and teasers, cause labels, par, case number. If logged in: the player's attempt state, including bodies of files they've already opened. |
| `POST /api/attempt/open` `{caseId, index}` | Auth required. Creates the attempt if missing (sets `started_at`). Rejects if the attempt is finished. Appends the index if new. Returns that file's body. |
| `POST /api/attempt/accuse` `{caseId, causeIndex}` | Auth required. Wrong pick: append to `wrong`, return the feedback for that cause. 3rd wrong: finish, score 0. Correct: mark solved and return the bonus question (without its answer). |
| `POST /api/attempt/bonus` `{caseId, optionIndex}` | Auth required. One shot. Finishes the attempt, computes the final score, returns score, rank, explanation and share text. |
| `GET /api/leaderboard?case=N&scope=top\|me` | Top 100, plus the player's own rank and the 2 players either side of them. |

Rate limit the write routes (e.g. 30 requests/min per user). Flag attempts that finish in under 20 seconds for review; don't auto-ban.

## 7. Making it harder (content rules)

The prototype case is the **easy tier**. Real cases get harder through the week, like the NYT crossword:

| Day | Files | Par | Causes listed | What makes it hard |
|---|---|---|---|---|
| Mon | 8 | 2 | 12 | One clear trap |
| Wed | 10 | 3 | 14 | The answer needs arithmetic across two files |
| Fri | 12 | 3-4 | 16 | Two traps that each explain part of the gap; near-miss causes in the list |
| Sat | 12 | 4 | 16 | The obvious file is misleading on its own; the bonus question is about second-order effects |

Every case must follow these rules:

- **One cause explains at least 90% of the gap.** The numbers must reconcile exactly: P&L lines sum to the totals, and channel × rate = the line item. Wrong causes must each be refutable by at least one file.
- **At least 2 traps**: a cause that looks right in one file and is disproved by another.
- **Par is genuinely reachable.** Write down the par path in the explanation and check it.
- **Indian businesses, Indian numbers** (₹ lakh/crore, Bangalore/Mumbai/Delhi, Swiggy, Zepto, kirana, D2C, SaaS, hotels, cloud kitchens, logistics, fintech).
- **Fictional companies only.** No real company names as the case subject.
- **Bonus question** (multiple choice, 4 options, one correct): the right fix or the next number to watch. Objective, not opinion.
- **Original content only.** Harvard/Ivey/ISB case studies are copyrighted. Use them as inspiration for *types* of problems (channel conflict, working capital squeeze, cannibalisation, unit economics, pricing errors), never as source text or data.

### Case file format

Each case lives in `cases/NNN-slug.json` and is validated by a zod schema. Write `scripts/validate-cases.ts`, which checks:

- the schema
- `answer_index` and `par` are in range
- every evidence table with a `total` row sums correctly (declare numeric columns in the block)
- every wrong cause has non-empty feedback

Then write `scripts/seed-cases.ts`, which upserts the validated files into Supabase. Case #1 is Kettle & Co, extracted from `prototype.html`. Add a bonus question to it: *"What should the CEO do first?"*, with the correct option being "Price the delivery menu above the counter menu and stop funding platform discounts."

## 8. Screens

1. **Today** (`/`): the HUD (points, files opened, accusations left, clock), brief, evidence grid, accusation form. Same layout as the prototype.
2. **Result**: stamp, score breakdown, vs par, rank ("#14 of 2,380 today"), explanation, share box, leaderboard preview.
3. **Leaderboard** (`/leaderboard`): today's results by default, plus a switch for the last 7 days (sum of scores).
4. **Sign-in sheet**: email → 6-digit code → username (first time only).
5. **Archive** (`/case/N`): past cases, playable unranked. Ship this after launch.

The share text (copy button) must not spoil the answer:

```
Root Cause #12 🕵️ Kettle & Co
🟩⬛🟩⬛⬛⬛⬛⬛
❌✅ +bonus · 655 pts · #14 today
2 files (par) · 1:42
rootcause.in
```

Add a dynamic Open Graph image (`next/og`) per case, showing the case headline, so links shared on LinkedIn and WhatsApp look good.

## 9. Build order

**Phase 1: launch-ready core**
1. Scaffold Next.js + TS, port the prototype UI into components, create the GitHub repo and push.
2. Supabase project, schema migrations, RLS, seed Case #1.
3. Email OTP auth + username flow.
4. Server-side game API + scoring + tests (`vitest`: scoring formula, one-attempt rule, no answer leakage in `GET /api/case/today`).
5. Result screen, leaderboard, share text, OG image.
6. Deploy to Vercel. Add a README with env vars and the "add a new case" steps.

**Phase 2: retention (week 1)**
- Daily email at 9am IST with yesterday's rank and today's headline (Resend)
- Streaks
- Archive
- College/company leagues (players join a league by code; separate leaderboards)

## 10. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only, never exposed to the client
LAUNCH_DATE=2026-10-11          # IST date of Case #1
NEXT_PUBLIC_SITE_URL=
```

## 11. Definition of done for Phase 1

- [ ] A new player can read today's brief without an account, sign in with an email code, pick a username, play, and see their rank.
- [ ] Viewing page source or network responses before finishing never reveals the answer, unopened file bodies, or cause feedback.
- [ ] A second ranked attempt on the same case is rejected by the database.
- [ ] Scores match the formula in §4, verified by tests.
- [ ] `validate-cases` passes on all case files.
- [ ] Works at 375px width in light and dark mode.
- [ ] Deployed on a public URL.
