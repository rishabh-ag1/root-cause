import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { applyOpen, emptyAttempt, playerView, publicCase, type StoredCase } from '@/lib/game';
import { validateCase, parseNum } from '@/lib/caseSchema';
import raw from '../cases/001-saltwater-labs.json';

const c = { ...(raw as unknown as StoredCase), id: 1, publish_date: '2026-10-11' };
const migration = () => readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/0001_init.sql'), 'utf8');

/** Every string that must stay secret until the attempt ends. */
function secrets(sc: StoredCase) {
  const ex = sc.explanation;
  const s: string[] = [];
  sc.evidence.forEach((e) => s.push(JSON.stringify(e.body)));
  sc.causes.forEach((x) => x.feedback && s.push(x.feedback));
  s.push(ex.answer, ex.fastest_path.join(), sc.bonus.explanation, ...(Array.isArray(ex.traps) ? ex.traps : [ex.traps]));
  if (ex.cash_bridge) s.push(ex.cash_bridge);
  if (ex.lesson) s.push(ex.lesson);
  return s;
}

describe('no answer leakage in GET /api/case/today', () => {
  it('public case contains no bodies, feedback, answer or explanation', () => {
    const pub = publicCase(c);
    const json = JSON.stringify(pub);
    for (const secret of secrets(c)) expect(json).not.toContain(secret);
    expect(json).not.toContain('answer_index');
    expect(json).not.toContain('"body"');
    expect(Object.keys(pub)).not.toContain('bonus');
  });

  it('player view mid-game reveals only opened files and own wrong-pick feedback', () => {
    const a = applyOpen(emptyAttempt(), c, 0, new Date().toISOString()).attempt;
    const v = playerView({ ...a, wrong: [1] }, c);
    const json = JSON.stringify(v);
    expect(Object.keys(v.bodies)).toEqual(['0']);
    expect(json).not.toContain(JSON.stringify(c.evidence[10].body));
    expect(json).toContain(c.causes[1].feedback!);
    expect(json).not.toContain(c.causes[0].feedback!);
    expect(json).not.toContain(c.explanation.answer);
    expect(v.reveal).toBeNull();
    expect(json).not.toContain('answer_index');
  });
});

describe('one ranked attempt per account per case', () => {
  it('is enforced by a unique constraint in the schema', () => {
    expect(migration()).toMatch(/unique \(user_id, case_id\)/);
  });
  it('cases table has RLS on and no select policy', () => {
    expect(migration()).toMatch(/alter table public\.cases enable row level security/);
    expect(migration()).not.toMatch(/on public\.cases/);
  });
});

describe('case validation', () => {
  it('Case #1 is valid', () => {
    const r = validateCase(raw);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
  it('reads bracketed negatives and units', () => {
    expect(parseNum('(152)')).toBe(-152);
    expect(parseNum('₹1.4L')).toBe(1.4);
    expect(parseNum('9,950')).toBe(9950);
    expect(parseNum('60 days')).toBeNull();
  });
  it('catches a P&L that does not reconcile', () => {
    const broken = structuredClone(raw) as { evidence: { body: { type: string; rows?: string[][] }[] }[] };
    broken.evidence[0].body[0].rows![1][1] = '(124)';
    expect(validateCase(broken).ok).toBe(false);
  });
  it('requires feedback on every wrong cause', () => {
    const broken = structuredClone(raw);
    broken.causes[0].feedback = '';
    expect(validateCase(broken).ok).toBe(false);
  });
});

describe('every case file in cases/', () => {
  const dir = path.resolve(import.meta.dirname, '../cases');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    it(`${f} validates and has one answer with no feedback`, () => {
      const raw = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
      const r = validateCase(raw);
      expect(r.ok ? [] : r.errors).toEqual([]);
      if (r.ok) expect(r.data.causes.filter((c) => !c.feedback).length).toBe(1);
    });
  }
});
