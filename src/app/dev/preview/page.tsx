import { notFound } from 'next/navigation';
import Game from '@/components/Game';
import { computeScore, emptyAttempt, playerView, publicCase, type StoredCase } from '@/lib/game';
import raw from '../../../../cases/001-saltwater-labs.json';

export const dynamic = 'force-dynamic';

/**
 * Dev-only: renders Case #1 from the JSON file without Supabase, as a finished ranked attempt.
 * Tap "Replay for practice" to play the full game locally. 404s in production.
 */
export default function Preview() {
  if (process.env.NODE_ENV === 'production') notFound();
  const { units_note, ...file } = raw as unknown as StoredCase & { units_note?: string };
  const c: StoredCase = { ...file, brief: { ...file.brief, units_note }, id: 1, publish_date: new Date().toISOString().slice(0, 10) };
  const attempt = {
    ...emptyAttempt(),
    started_at: new Date(Date.now() - 100_000).toISOString(),
    opened: [5, 10],
    wrong: [2],
    solved: true,
    solved_at: new Date(Date.now() - 2_000).toISOString(),
    bonus_correct: true,
    finished_at: new Date(Date.now() - 2_000).toISOString(),
    elapsed_seconds: 98,
    score: computeScore({ files: 2, wrong: 1, seconds: 98, solved: true }),
  };
  const rows = [
    { rank: 1, username: 'ledger_lord', score: 836, files: 2, wrong: 0, elapsed_seconds: 41, bonus_correct: true, solved: true },
    { rank: 2, username: 'cashflow_kid', score: 815, files: 2, wrong: 0, elapsed_seconds: 105, bonus_correct: false, solved: true },
    { rank: 3, username: 'margin_call', score: 712, files: 3, wrong: 0, elapsed_seconds: 190, bonus_correct: true, solved: true },
  ];
  const me = { rank: 14, username: 'you_detective', score: attempt.score, files: 2, wrong: 1, elapsed_seconds: 98, bonus_correct: true, solved: true };
  return (
    <Game
      initial={{
        serverNow: new Date().toISOString(),
        case: publicCase(c),
        me: { email: 'preview@example.com', username: 'you_detective' },
        attempt: playerView(attempt, c),
        final: {
          rank: 14,
          total: 2380,
          share: `Root Cause #1 🕵️ ${c.company}\n⬛⬛⬛⬛⬛🟩⬛⬛⬛⬛🟩⬛\n❌✅ ⭐ · ${attempt.score} pts · #14 today\n2 files (par) · 1:38\nrootcause.in`,
          preview: rows,
          me,
        },
      }}
    />
  );
}
