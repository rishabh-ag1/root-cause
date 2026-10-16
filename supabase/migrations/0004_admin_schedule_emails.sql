-- Case library + manual scheduling, admin flag, "new case is live" emails.

-- Cases: a stable slug is the identity. Unscheduled cases have no date and no number yet;
-- the admin assigns a publish date, and the case number follows from it.
alter table public.cases add column if not exists slug text;
update public.cases set slug = 'saltwater-labs' where slug is null and company = 'Saltwater Labs';
update public.cases set slug = 'case-' || id where slug is null;
alter table public.cases alter column slug set not null;
alter table public.cases add constraint cases_slug_key unique (slug);
alter table public.cases alter column publish_date drop not null;
alter table public.cases alter column case_number drop not null;
alter table public.cases add column if not exists created_at timestamptz not null default now();

-- Admins and email preferences.
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists email_opt_out boolean not null default false;

-- One "new case is live" send per case, so a retry never emails anyone twice.
create table if not exists public.case_emails (
  id bigserial primary key,
  case_id int not null references public.cases on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  recipients int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  error text,
  triggered_by text not null default 'cron',
  unique (case_id)
);
alter table public.case_emails enable row level security; -- server only, no policies
