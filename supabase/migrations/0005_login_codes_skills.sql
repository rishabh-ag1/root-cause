-- 4-digit sign-in codes (our own, since Supabase's minimum is 6) and skill tags on cases.

create table if not exists public.login_codes (
  email text primary key,               -- lower-cased
  code_hash text not null,              -- HMAC of email + code; the code itself is never stored
  expires_at timestamptz not null,
  attempts int not null default 0,      -- wrong guesses on this code
  sends int not null default 1,         -- codes sent in the current window
  window_started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.login_codes enable row level security; -- server only, no policies

alter table public.cases add column if not exists skills text[] not null default '{}';
