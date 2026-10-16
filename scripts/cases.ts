import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { validateCase } from '../src/lib/caseSchema';

export const CASES_DIR = path.resolve(import.meta.dirname, '..', 'cases');

export type Loaded = { file: string; slug: string; result: ReturnType<typeof validateCase> };

/** `001-saltwater-labs.json` → `saltwater-labs`, `bharat-bricks.json` → `bharat-bricks`. */
export const slugFromFile = (file: string) => file.replace(/\.json$/, '').replace(/^\d{3}-/, '');

/** Reads and validates every case file. The slug (from the file name) is each case's identity. */
export function loadCases(): { loaded: Loaded[]; errors: string[] } {
  const files = readdirSync(CASES_DIR).filter((f) => f.endsWith('.json')).sort();
  const errors: string[] = [];
  const seen = new Map<string, string>();
  const loaded = files.map((file) => {
    const slug = slugFromFile(file);
    if (!/^[a-z0-9-]+$/.test(slug)) errors.push(`${file}: file name must be lowercase-with-hyphens`);
    if (seen.has(slug)) errors.push(`${file}: slug "${slug}" also used by ${seen.get(slug)}`);
    seen.set(slug, file);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path.join(CASES_DIR, file), 'utf8'));
    } catch (e) {
      return { file, slug, result: { ok: false as const, errors: [`invalid JSON: ${(e as Error).message}`] } };
    }
    const result = validateCase(raw);
    if (result.ok && result.data.slug && result.data.slug !== slug) errors.push(`${file}: "slug" field says ${result.data.slug}`);
    return { file, slug, result };
  });
  return { loaded, errors };
}
