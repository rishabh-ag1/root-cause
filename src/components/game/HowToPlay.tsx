'use client';
import Sheet from '../ui/Sheet';
import { CARD_COST, MAX_WRONG, START_POINTS, TIME_CAP, WRONG_COST } from '@/lib/game';

const STEPS: [string, string][] = [
  ['Read the case', 'The brief tells you what went wrong at the company and gives you the headline numbers. Reading is free.'],
  ['Open evidence files', `Each file is a clue, like a P&L, sales by channel or customer reviews. Opening one costs ${CARD_COST} points, so only open what you need.`],
  ['Pick the root cause', `Choose the one real reason from the list and press Submit. You get ${MAX_WRONG} guesses; a wrong one costs ${WRONG_COST} points and tells you why it's wrong.`],
  ['Be quick', `The clock starts when you open your first file and costs 1 point every 3 seconds (at most ${TIME_CAP}).`],
];

/** Brief rules, opened from the "How to play" link on the game page. */
export default function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      className="howto-sheet"
      kicker="How to play"
      title="Find out what went wrong"
      footer={<button className="btn ink block" onClick={onClose}>Got it</button>}
    >
      <p className="howto-lead">You start with <b>{START_POINTS.toLocaleString('en-IN')} points</b>. Solve the case while spending as few as you can.</p>
      <ol className="howto">
        {STEPS.map(([t, d], i) => (
          <li key={t}>
            <span className="howto-n" aria-hidden="true">{i + 1}</span>
            <div><b>{t}</b><span>{d}</span></div>
          </li>
        ))}
      </ol>
      <p className="howto-foot">Everyone plays the same case. Highest score ranks first on today&apos;s leaderboard; ties go to the faster player. A new case goes live every day at 9am.</p>
    </Sheet>
  );
}
