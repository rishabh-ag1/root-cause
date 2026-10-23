'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import SignIn from '../SignIn';
import { track } from '@/lib/track';

export const INTRO_KEY = 'rc-howto-seen';

/**
 * The one way into the game: marks the rules as read, signs the player in if needed,
 * then goes to /play. Challenge (?c=) and UTM params are carried along.
 */
export default function StartButton({ signedIn, hasUsername, finished, label }: { signedIn: boolean; hasUsername: boolean; finished: boolean; label?: string }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | 'email' | 'username'>(null);
  const [qs, setQs] = useState('');
  useEffect(() => setQs(location.search), []);

  const go = () => router.push('/play' + qs);

  function start() {
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {}
    track('intro_start', { signed_in: signedIn, finished });
    if (finished || (signedIn && hasUsername)) return go();
    track('signin_prompt');
    setSheet(signedIn ? 'username' : 'email');
  }

  return (
    <>
      <button className="btn primary block start-btn" onClick={start}>
        {label ?? (finished ? "See today's result" : "Start today's case")}
      </button>
      {sheet && (
        <SignIn
          startAt={sheet}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            go();
          }}
        />
      )}
    </>
  );
}
