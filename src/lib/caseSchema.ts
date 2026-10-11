import { z } from 'zod';

/** A table cell. `{v, tone:'up'}` renders in the alert colour, `'down'` in the good colour. */
export const Cell = z.union([
  z.string(),
  z.object({ v: z.string(), tone: z.enum(['up', 'down']) }),
]);
export type Cell = z.infer<typeof Cell>;

export const TableBlock = z.object({
  type: z.literal('table'),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(Cell)).min(1),
  total: z.array(Cell).optional(),
  /**
   * Declares which columns must add up to the total row. Write negatives in brackets, e.g. "(152)",
   * so a P&L reconciles as a plain sum.
   */
  sum_check: z.object({ columns: z.array(z.number().int().nonnegative()).min(1) }).optional(),
});

export const NoteBlock = z.object({ type: z.literal('note'), text: z.string().min(1) });
export const QuoteBlock = z.object({ type: z.literal('quote'), text: z.string().min(1), source: z.string().min(1) });

export const Block = z.discriminatedUnion('type', [TableBlock, NoteBlock, QuoteBlock]);
export type Block = z.infer<typeof Block>;
export type TableBlock = z.infer<typeof TableBlock>;

export const Evidence = z.object({
  title: z.string().min(1),
  teaser: z.string().min(1),
  body: z.array(Block).min(1),
});

export const Cause = z.object({
  label: z.string().min(1),
  /** Shown when this cause is picked wrongly. Null/empty for the answer. */
  feedback: z.string().nullable(),
});

const strOrList = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const CaseFile = z
  .object({
    case_number: z.number().int().positive(),
    slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
    /** Ignored by the seed script, which derives it from LAUNCH_DATE. Allowed so authored files validate. */
    publish_date: z.string().optional(),
    difficulty: z.enum(DIFFICULTIES),
    title: z.string().min(1),
    company: z.string().min(1),
    units_note: z.string().optional(),
    brief: z.object({
      tag: z.string().min(1).optional(),
      units_note: z.string().optional(),
      headline: z.string().min(1),
      story: z.string().min(1),
      facts: z.array(z.object({ label: z.string(), value: z.string(), tone: z.enum(['down', 'up']).optional() })),
    }),
    evidence: z.array(Evidence).min(2),
    causes: z.array(Cause).min(4),
    answer_index: z.number().int().nonnegative(),
    bonus: z.object({
      question: z.string().min(1),
      options: z.array(z.string().min(1)).length(4),
      answer_index: z.number().int().min(0).max(3),
      explanation: z.string().min(1),
    }),
    explanation: z.object({
      answer: z.string().min(1),
      why: z.array(z.string().min(1)).optional(),
      cash_bridge: z.string().optional(),
      fastest_path: z.array(z.string().min(1)).min(1),
      traps: strOrList,
      fix: z.string().optional(),
      lesson: z.string().optional(),
    }),
    par: z.number().int().positive(),
    status: z.enum(['draft', 'scheduled', 'live']).default('scheduled'),
  })
  .superRefine((c, ctx) => {
    if (c.answer_index >= c.causes.length)
      ctx.addIssue({ code: 'custom', path: ['answer_index'], message: 'answer_index is out of range' });
    if (c.par > c.evidence.length)
      ctx.addIssue({ code: 'custom', path: ['par'], message: 'par is larger than the number of files' });
    c.causes.forEach((cause, i) => {
      if (i !== c.answer_index && !cause.feedback?.trim())
        ctx.addIssue({ code: 'custom', path: ['causes', i, 'feedback'], message: 'wrong cause needs feedback' });
    });
    c.evidence.forEach((e, i) =>
      e.body.forEach((b, j) => {
        if (b.type !== 'table') return;
        const width = b.columns.length;
        [...b.rows, ...(b.total ? [b.total] : [])].forEach((r, k) => {
          if (r.length !== width)
            ctx.addIssue({ code: 'custom', path: ['evidence', i, 'body', j], message: `row ${k} has ${r.length} cells, expected ${width}` });
        });
      }),
    );
  });

export type CaseFile = z.infer<typeof CaseFile>;

/**
 * Parse "₹84.0L", "(152)", "−3.9", "+1.3", "9,950", "18.2%" into a number.
 * Returns null for non-numbers like "—" or "60 days".
 */
export function parseNum(s: string): number | null {
  let t = s.trim().replace(/[₹,%\s]/g, '').replace(/(L|K|Cr)$/i, '').replace('−', '-').replace(/^\+/, '');
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return neg ? -Number(t) : Number(t);
}

export const cellText = (c: Cell) => (typeof c === 'string' ? c : c.v);

/** Returns a list of human-readable problems with a table's declared totals. */
export function checkTableTotals(t: TableBlock, where: string): string[] {
  if (!t.sum_check) return [];
  if (!t.total) return [`${where}: has sum_check but no total row`];
  const problems: string[] = [];
  for (const col of t.sum_check.columns) {
    const vals = t.rows.map((r) => parseNum(cellText(r[col] ?? '')));
    const total = parseNum(cellText(t.total[col] ?? ''));
    if (total === null || vals.some((v) => v === null)) {
      problems.push(`${where}: column ${col} ("${t.columns[col]}") has a non-numeric cell`);
      continue;
    }
    const computed = (vals as number[]).reduce((a, b) => a + b, 0);
    if (Math.abs(computed - total) > 0.051)
      problems.push(`${where}: column "${t.columns[col]}" adds to ${+computed.toFixed(2)} but total says ${total}`);
  }
  return problems;
}

/** Full validation used by scripts/validate-cases.ts and the tests. */
export function validateCase(raw: unknown): { ok: true; data: CaseFile } | { ok: false; errors: string[] } {
  const parsed = CaseFile.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  const errors: string[] = [];
  parsed.data.evidence.forEach((e, i) =>
    e.body.forEach((b, j) => {
      if (b.type === 'table') errors.push(...checkTableTotals(b, `evidence[${i}] "${e.title}" block ${j}`));
    }),
  );
  return errors.length ? { ok: false, errors } : { ok: true, data: parsed.data };
}
