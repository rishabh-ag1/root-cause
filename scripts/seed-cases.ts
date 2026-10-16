import { createClient } from '@supabase/supabase-js';
import { loadCases } from './cases';

// Syncs case files into Supabase, keyed by slug (the file name).
// - New cases are added to the library as unscheduled drafts. Schedule them from /admin.
// - Existing cases get their content refreshed; their date, number and status (set in admin) are left alone.
// Run with: npm run seed-cases   (reads .env.local)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const { loaded, errors } = loadCases();
if (loaded.some((l) => !l.result.ok) || errors.length) {
  console.error('Fix case files first (npm run validate-cases).');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: existing, error: listErr } = await sb.from('cases').select('slug');
if (listErr) {
  console.error(listErr.message);
  process.exit(1);
}
const have = new Set((existing ?? []).map((r: { slug: string }) => r.slug));

for (const { file, slug, result } of loaded) {
  if (!result.ok) continue;
  const c = result.data;
  const content = {
    difficulty: c.difficulty,
    title: c.title,
    company: c.company,
    brief: { ...c.brief, units_note: c.units_note ?? c.brief.units_note },
    evidence: c.evidence,
    causes: c.causes,
    answer_index: c.answer_index,
    bonus: c.bonus,
    explanation: c.explanation,
    par: c.par,
  };
  const { error } = have.has(slug)
    ? await sb.from('cases').update(content).eq('slug', slug)
    : await sb.from('cases').insert({ ...content, slug, status: 'draft', publish_date: null, case_number: null });
  if (error) {
    console.error(`✗ ${file}: ${error.message}`);
    process.exit(1);
  }
  console.log(`${have.has(slug) ? '↻ updated' : '+ added  '} ${slug} (${c.difficulty}, ${c.evidence.length} files, par ${c.par})`);
}
