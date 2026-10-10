import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { applyOpen, emptyAttempt, playerView, publicCase, type StoredCase } from '@/lib/game';
import { validateCase } from '@/lib/caseSchema';
import kettle from '../cases/001-kettle-co.json';

const c = { ...(kettle as unknown as StoredCase), id: 1, publish_date: '2026-10-11' };

/** Every string that must stay secret until the attempt ends. */
function secrets(sc: StoredCase) {
  const s: string[] = [];
  sc.evidence.forEach((e) => s.push(JSON.stringify(e.body)));
  sc.causes.forEach((x) => x.feedback && s.push(x.feedback));
  s.push(sc.explanation.answer, sc.explanation.traps, sc.explanation.fix, ...sc.explanation.why, ...sc.explanation.fastest_path, sc.bonus.explanation);
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
    expect(json).not.toContain(JSON.stringify(c.evidence[2].body));
    expect(json).toContain(c.causes[1].feedback);
    expect(json).not.toContain(c.causes[0].feedback);
    expect(json).not.toContain(c.explanation.fix);
    expect(v.reveal).toBeNull();
    expect(json).not.toContain('answer_index');
  });

  it('the bonus question is shown without its answer while pending', () => {
    const v = playerView({ ...emptyAttempt(), started_at: 'x', solved: true, solved_at: 'x' }, c);
    expect(v.bonusQuestion).toEqual({ question: c.bonus.question, options: c.bonus.options });
    expect(JSON.stringify(v)).not.toContain(c.bonus.explanation);
  });
});

describe('one ranked attempt per account per case', () => {
  it('is enforced by a unique constraint in the schema', () => {
    const sql = readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/0001_init.sql'), 'utf8');
    expect(sql).toMatch(/unique \(user_id, case_id\)/);
  });
  it('cases table has RLS on and no select policy', () => {
    const sql = readFileSync(path.resolve(import.meta.dirname, '../supabase/migrations/0001_init.sql'), 'utf8');
    expect(sql).toMatch(/alter table public\.cases enable row level security/);
    expect(sql).not.toMatch(/on public\.cases/);
  });
});

describe('case validation', () => {
  it('Case #1 is valid', () => {
    const r = validateCase(kettle);
    expect(r.ok ? [] : r.errors).toEqual([]);
  });
  it('catches a P&L that does not reconcile', () => {
    const broken = structuredClone(kettle) as { evidence: { body: { type: string; rows?: string[][] }[] }[] };
    broken.evidence[0].body[0].rows![0][1] = '85.0';
    const r = validateCase(broken);
    expect(r.ok).toBe(false);
  });
  it('requires feedback on every wrong cause', () => {
    const broken = structuredClone(kettle);
    broken.causes[0].feedback = '';
    expect(validateCase(broken).ok).toBe(false);
  });
});
