'use client';
import Sheet from '../ui/Sheet';
import { CARD_COST, MAX_WRONG, WRONG_COST } from '@/lib/game';

const STEPS = [
  { icon: '📄', title: 'Read the brief', text: 'A business has a problem. Free to read.' },
  { icon: '📂', title: 'Open evidence', text: `Each file costs ${CARD_COST} points. Open as few as you can.` },
  { icon: '🎯', title: 'Name the root cause', text: `${MAX_WRONG} guesses. A wrong one costs ${WRONG_COST}.` },
  { icon: '⏱', title: 'Beat the clock', text: 'Starts at your first file. 1 point every 3 seconds.' },
  { icon: '🏆', title: 'Climb the leaderboard', text: 'Same case for everyone. New one daily at 9am.' },
];

export default function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      kicker="How to play"
      title="Crack the case in as few moves as you can"
      footer={<button className="btn primary block" onClick={onClose}>Let&apos;s go</button>}
    >
      <ol className="howto">
        {STEPS.map((s) => (
          <li key={s.title}>
            <span className="howto-icon" aria-hidden="true">{s.icon}</span>
            <div><b>{s.title}</b><span>{s.text}</span></div>
          </li>
        ))}
      </ol>
      <p className="foot center">You start with 1,000 points.</p>
    </Sheet>
  );
}
