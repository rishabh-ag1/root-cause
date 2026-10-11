import { createClient } from '@supabase/supabase-js';
import { loadCases } from './cases';
import { publishDateFor } from '../src/lib/dates';

// Upserts every valid case file into Supabase. publish_date = LAUNCH_DATE + (case_number − 1) days.
// Run with: npm run seed-cases   (reads .env.local)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const launch = process.env.LAUNCH_DATE?.trim();
if (!url || !key || !launch) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and LAUNCH_DATE in .env.local');
  process.exit(1);
}

const { loaded, errors } = loadCases();
const invalid = loaded.filter((l) => !l.result.ok);
if (invalid.length || errors.length) {
  console.error('Fix case files first (npm run validate-cases).');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

for (const { file, result } of loaded) {
  if (!result.ok) continue;
  // slug lives in the file name; publish_date always comes from LAUNCH_DATE; units_note is shown with the brief.
  const { slug: _slug, publish_date: _pd, units_note, ...c } = result.data;
  const row = { ...c, brief: { ...c.brief, units_note }, publish_date: publishDateFor(c.case_number, launch) };
  const { error } = await sb.from('cases').upsert(row, { onConflict: 'case_number' });
  if (error) {
    console.error(`✗ ${file}: ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ ${file} → case #${c.case_number} on ${row.publish_date} (${c.status})`);
}
