import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { validateCase, type CaseFile } from '../src/lib/caseSchema';

export const CASES_DIR = path.resolve(import.meta.dirname, '..', 'cases');

export type Loaded = { file: string; result: ReturnType<typeof validateCase> };

/** Reads and validates every cases/NNN-slug.json. Also checks numbering and file names. */
export function loadCases(): { loaded: Loaded[]; errors: string[] } {
  const files = readdirSync(CASES_DIR).filter((f) => f.endsWith('.json')).sort();
  const errors: string[] = [];
  const seen = new Map<number, string>();
  const loaded = files.map((file) => {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path.join(CASES_DIR, file), 'utf8'));
    } catch (e) {
      return { file, result: { ok: false as const, errors: [`invalid JSON: ${(e as Error).message}`] } };
    }
    const result = validateCase(raw);
    if (result.ok) {
      const c: CaseFile = result.data;
      const expected = `${String(c.case_number).padStart(3, '0')}-${c.slug}.json`;
      if (file !== expected) errors.push(`${file}: should be named ${expected}`);
      if (seen.has(c.case_number)) errors.push(`${file}: case_number ${c.case_number} also used by ${seen.get(c.case_number)}`);
      seen.set(c.case_number, file);
    }
    return { file, result };
  });
  return { loaded, errors };
}
