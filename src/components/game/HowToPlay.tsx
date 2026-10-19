'use client';
import Sheet from '../ui/Sheet';
import { CARD_COST, MAX_WRONG, WRONG_COST } from '@/lib/game';

const STEPS = [
  ['Read the brief', 'A business has a problem. Reading is free.'],
  ['Open evidence', `Each file costs ${CARD_COST} points. Open as few as you can.`],
  ['Name the root cause', `You get ${MAX_WRONG} guesses. A wrong one costs ${WRONG_COST}.`],
  ['Be quick', 'The clock starts at your first file: 1 point every 3 seconds.'],
];

export default function HowToPlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} kicker="How to play" title="One case. Fewest moves wins." footer={<button className="btn primary block" onClick={onClose}>Start</button>}>
      <ol className="howto">
        {STEPS.map(([t, d]) => (
          <li key={t}><b>{t}</b><span>{d}</span></li>
        ))}
      </ol>
      <p className="muted small">Everyone gets the same case. A new one goes live every day at 9am.</p>
    </Sheet>
  );
}
