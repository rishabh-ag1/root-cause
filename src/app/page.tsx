import Link from 'next/link';
import { todayPayload } from '@/lib/today';
import { CARD_COST, WRONG_COST } from '@/lib/game';
import StartButton from '@/components/landing/StartButton';
import ChallengeNote from '@/components/landing/ChallengeNote';

export const dynamic = 'force-dynamic';

const LEVEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

/** A one-screen start page in the spirit of NYT Games: name, three rules, one button. */
export default async function Home() {
  const p = await todayPayload();
  const finished = !!p?.attempt?.finished;
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });

  return (
    <main className="splash">
      <div className="splash-mark" aria-hidden="true">RC</div>
      <h1>Root Cause</h1>
      <p className="splash-tag">One business mystery a day.<br />Find out what went wrong.</p>

      <ul className="splash-rules">
        <li>Read about a company in trouble.</li>
        <li>Open clues, but each costs {CARD_COST} points.</li>
        <li>Pick the real reason. Wrong guesses cost {WRONG_COST}.</li>
      </ul>

      <ChallengeNote />

      {p ? (
        <>
          <div className="splash-cta">
            <StartButton signedIn={!!p.me} hasUsername={!!p.me?.username} finished={finished} label={finished ? 'See your result' : 'Play'} />
          </div>
          <p className="splash-meta">
            {date}
            <br />
            Case {p.case.caseNumber} · {LEVEL[p.case.difficulty] ?? p.case.difficulty}
            {finished && p.attempt ? ` · You scored ${p.attempt.score ?? 0}` : ''}
          </p>
        </>
      ) : (
        <p className="splash-meta">The next case goes live at 9am.</p>
      )}

      <p className="splash-foot">
        Fewest clues and wrong guesses wins. Everyone gets the same case, so you can see your rank on the <Link href="/leaderboard">leaderboard</Link>.
      </p>
    </main>
  );
}
