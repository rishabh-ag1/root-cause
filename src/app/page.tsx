import Link from 'next/link';
import { todayPayload } from '@/lib/today';
import { caseLeaderboard } from '@/lib/repo';
import { CARD_COST, MAX_WRONG, START_POINTS, TIME_CAP, WRONG_COST } from '@/lib/game';
import StartButton from '@/components/landing/StartButton';
import ChallengeNote from '@/components/landing/ChallengeNote';

export const dynamic = 'force-dynamic';

const LEVEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

/** The landing page: what the game is, how to play, how ranking works. One button into the game. */
export default async function Home() {
  const p = await todayPayload();
  const board = p ? await caseLeaderboard(p.case.id, null).catch(() => null) : null;
  const signedIn = !!p?.me;
  const hasUsername = !!p?.me?.username;
  const finished = !!p?.attempt?.finished;
  const top = board?.top.filter((r) => r.solved).slice(0, 3) ?? [];

  return (
    <main className="wrap landing">
      <section className="hero">
        <p className="kicker">The daily business case</p>
        <h1>Find out why a business is in trouble, in as few moves as you can.</h1>
        <p className="hero-sub">
          Every morning there&apos;s one new case about a real-feeling Indian business. Read the brief, dig through the evidence, and name the root cause. Everyone gets the same case, so you can see how sharp your business instinct is against everyone else.
        </p>
      </section>

      <ChallengeNote />

      {p ? (
        <section className="today-card">
          <div>
            <p className="kicker">Today · Case {p.case.caseNumber} · {LEVEL[p.case.difficulty] ?? p.case.difficulty}</p>
            <p className="today-company">{p.case.company}</p>
            <p className="muted small">{board?.total ? `${board.total} ${board.total === 1 ? 'person has' : 'people have'} played so far` : 'Be the first to crack it'}</p>
          </div>
          {finished && p.attempt && <p className="today-done">You scored <b>{p.attempt.score ?? 0}</b>{p.final?.rank ? <> · #{p.final.rank}</> : null}</p>}
        </section>
      ) : (
        <section className="today-card"><p className="muted">The next case goes live at 9am IST.</p></section>
      )}

      <section className="steps-block">
        <h2>How to play</h2>
        <ol className="howsteps">
          <li>
            <span className="step-n">1</span>
            <div><b>Read the case</b><p>A short brief tells you what went wrong at a company, for example &ldquo;sales are up but profit fell&rdquo;. Reading it is free.</p></div>
          </li>
          <li>
            <span className="step-n">2</span>
            <div><b>Open evidence files</b><p>Each file is a clue: a P&amp;L, sales by channel, customer reviews and so on. Every file you open costs <b>{CARD_COST} points</b>, so only open what you need.</p></div>
          </li>
          <li>
            <span className="step-n">3</span>
            <div><b>Name the root cause</b><p>Pick the one real reason from a list. You get <b>{MAX_WRONG} guesses</b>. A wrong guess costs <b>{WRONG_COST} points</b> and tells you why it&apos;s wrong.</p></div>
          </li>
          <li>
            <span className="step-n">4</span>
            <div><b>Learn the answer</b><p>When you finish, you see the full solution, the traps, and the fastest path an expert would take.</p></div>
          </li>
        </ol>
      </section>

      <section className="score-block">
        <h2>How you score</h2>
        <div className="formula">
          <div><span>Start with</span><b>{START_POINTS.toLocaleString('en-IN')}</b></div>
          <div><span>Each file opened</span><b>−{CARD_COST}</b></div>
          <div><span>Each wrong guess</span><b>−{WRONG_COST}</b></div>
          <div><span>Time (from your first file)</span><b>−1 per 3 sec</b></div>
        </div>
        <p className="muted small">Time costs at most {TIME_CAP} points. If all {MAX_WRONG} guesses are wrong, the case stays unsolved and scores 0. Each case also shows a <b>par</b>: how many files an expert needs. Matching it is a great score.</p>
      </section>

      <section className="rank-block">
        <h2>How you&apos;re ranked</h2>
        <ul className="rank-points">
          <li><b>Same case for everyone.</b> One try per day, so every score is a fair comparison.</li>
          <li><b>Highest score wins.</b> If two players tie, the faster one ranks higher.</li>
          <li><b>Daily and weekly leaderboards.</b> Today&apos;s board resets at 9am with each new case; the 7-day board adds up your week.</li>
          <li><b>Build a streak and a title.</b> Play every day to grow your streak, and climb from Intern to Analyst, Associate, Manager, Director and Partner as your points add up.</li>
          <li><b>Challenge friends.</b> Share your result on WhatsApp; your friends play the same case and see if they can beat you.</li>
        </ul>
        {top.length > 0 && (
          <div className="mini-top">
            <p className="kicker">Leading today</p>
            <ol>
              {top.map((r) => (
                <li key={r.username}><span>{r.rank}</span><span>{r.username}</span><b>{r.score}</b></li>
              ))}
            </ol>
            <Link href="/leaderboard" className="muted small">Full leaderboard</Link>
          </div>
        )}
      </section>

      <section className="tips-block">
        <h2>A few tips</h2>
        <ul>
          <li>Start with the file that shows the money: the P&amp;L or bank statement usually points you somewhere.</li>
          <li>Every wrong answer on the list can be disproved by at least one file. The obvious suspect is often a trap.</li>
          <li>You don&apos;t need to open everything. The best players open two or three files.</li>
        </ul>
      </section>

      {p && (
        <div className="cta-bar">
          <StartButton signedIn={signedIn} hasUsername={hasUsername} finished={finished} />
        </div>
      )}
    </main>
  );
}
