-- Supabase advisor: keep extensions out of the public schema.
create schema if not exists extensions;
alter extension citext set schema extensions;

-- PostgREST caches type locations; reload so the API sees citext in its new schema.
notify pgrst, 'reload schema';
