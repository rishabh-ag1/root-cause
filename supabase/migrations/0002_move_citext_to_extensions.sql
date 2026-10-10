-- Supabase advisor: keep extensions out of the public schema.
create schema if not exists extensions;
alter extension citext set schema extensions;
