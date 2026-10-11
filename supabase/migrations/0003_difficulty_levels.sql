-- Allow named difficulty levels (easy/medium/hard/expert) as well as weekday tiers.
alter table public.cases drop constraint if exists cases_difficulty_check;
alter table public.cases add constraint cases_difficulty_check
  check (difficulty in ('easy','medium','hard','expert','mon','tue','wed','thu','fri','sat','sun'));
