-- Root Cause: initial schema
create extension if not exists citext;

-- Profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username citext unique not null
    check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  phone text null,
  created_at timestamptz not null default now()
);

-- Cases ---------------------------------------------------------------------
create table public.cases (
  id serial primary key,
  case_number int unique not null,
  publish_date date unique not null,          -- IST date
  difficulty text not null check (difficulty in ('mon','tue','wed','thu','fri','sat','sun')),
  title text not null,
  company text not null,
  brief jsonb not null,
  evidence jsonb not null,
  causes jsonb not null,
  answer_index int not null,
  bonus jsonb not null,
  explanation jsonb not null,
  par int not null,
  status text not null default 'draft' check (status in ('draft','scheduled','live'))
);

-- Attempts ------------------------------------------------------------------
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  case_id int not null references public.cases on delete cascade,
  started_at timestamptz,
  opened int[] not null default '{}',          -- in open order
  wrong int[] not null default '{}',
  solved boolean,
  solved_at timestamptz,                       -- clock stops at the correct accusation
  bonus_correct boolean,
  finished_at timestamptz,
  score int,
  elapsed_seconds int,
  flagged boolean not null default false,      -- finished suspiciously fast; review, don't ban
  rev int not null default 0,                  -- optimistic concurrency guard
  unique (user_id, case_id)
);

create index attempts_case_finished_idx on public.attempts (case_id) where finished_at is not null;

-- RLS -----------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.attempts enable row level security;

-- cases: no policies at all. Only the service role (server) can read them.

create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "read own attempts" on public.attempts
  for select to authenticated using (user_id = auth.uid());

-- All writes happen server-side with the service role key.

-- Leaderboards --------------------------------------------------------------
create or replace function public.leaderboard_case(p_case_id int)
returns table (
  rank bigint,
  user_id uuid,
  username citext,
  score int,
  files int,
  wrong int,
  elapsed_seconds int,
  bonus_correct boolean,
  solved boolean,
  finished_at timestamptz
)
language sql stable
set search_path = public
as $$
  select
    rank() over (order by a.score desc, a.elapsed_seconds asc, a.finished_at asc) as rank,
    a.user_id,
    p.username,
    a.score,
    coalesce(array_length(a.opened, 1), 0) as files,
    coalesce(array_length(a.wrong, 1), 0) as wrong,
    a.elapsed_seconds,
    coalesce(a.bonus_correct, false),
    coalesce(a.solved, false),
    a.finished_at
  from attempts a
  join profiles p on p.id = a.user_id
  where a.case_id = p_case_id and a.finished_at is not null
  order by 1, a.finished_at;
$$;

create or replace function public.leaderboard_week(p_end_date date)
returns table (
  rank bigint,
  user_id uuid,
  username citext,
  score bigint,
  played bigint,
  elapsed_seconds bigint
)
language sql stable
set search_path = public
as $$
  with totals as (
    select a.user_id, sum(a.score) as score, count(*) as played, sum(a.elapsed_seconds) as elapsed_seconds
    from attempts a
    join cases c on c.id = a.case_id
    where a.finished_at is not null
      and c.publish_date > p_end_date - 7 and c.publish_date <= p_end_date
    group by a.user_id
  )
  select
    rank() over (order by t.score desc, t.elapsed_seconds asc) as rank,
    t.user_id, p.username, t.score, t.played, t.elapsed_seconds
  from totals t join profiles p on p.id = t.user_id
  order by 1;
$$;

-- Only the server may call these (they expose user ids).
revoke execute on function public.leaderboard_case(int) from public, anon, authenticated;
revoke execute on function public.leaderboard_week(date) from public, anon, authenticated;
grant execute on function public.leaderboard_case(int) to service_role;
grant execute on function public.leaderboard_week(date) to service_role;
