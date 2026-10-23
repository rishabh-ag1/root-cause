'use client';
import Sheet from '../ui/Sheet';
import { CARD_COST, MAX_WRONG, WRONG_COST } from '@/lib/game';

const STEPS = [
  ['Read the case', 'A business has a problem. Reading the brief is free.'],
  ['Open evidence files', `Each file costs ${CARD_COST} points. The fewer you open, the higher you score.`],
  ['Name the root cause', `Pick the one real reason. You get ${MAX_WRONG} guesses; a wrong one costs ${WRONG_COST}.`],
  ['Be quick', 'The clock starts when you open your first file.'],
];

/**
 * Shown before anyone can play. No close button: the only way out is "Got it", so nobody
 * skips past the rules (players were dismissing it and then not understanding the game).
 */
export default function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      dismissible={false}
      className="howto-sheet"
      kicker="Before you start"
      title="How to play Root Cause"
      footer={<button className="btn ink block" onClick={onClose}>Got it, let&apos;s play</button>}
    >
      <p className="howto-lead">You start with <b>1,000 points</b>. Find out why the business is in trouble while spending as few as possible.</p>
      <ol className="howto">
        {STEPS.map(([t, d], i) => (
          <li key={t}>
            <span className="howto-n" aria-hidden="true">{i + 1}</span>
            <div><b>{t}</b><span>{d}</span></div>
          </li>
        ))}
      </ol>
      <p className="howto-foot">Everyone plays the same case. A new one goes live every day at 9am, and the leaderboard resets.</p>
    </Sheet>
  );
}
