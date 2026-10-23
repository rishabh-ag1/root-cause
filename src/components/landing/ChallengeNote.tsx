'use client';
import { useEffect, useState } from 'react';

type Challenge = { username: string; finished: boolean; score: number | null; solved: boolean | null };

/** "@friend scored 655 today. Can you beat that?" when someone arrives from a shared result. */
export default function ChallengeNote() {
  const [c, setC] = useState<Challenge | null>(null);
  useEffect(() => {
    const u = new URLSearchParams(location.search).get('c');
    if (u && /^[A-Za-z0-9_]{3,20}$/.test(u))
      fetch('/api/challenge?u=' + encodeURIComponent(u))
        .then(async (r) => r.ok && setC(await r.json()))
        .catch(() => {});
  }, []);
  if (!c) return null;
  return (
    <div className="note accent">
      <span>
        <b>@{c.username}</b>{' '}
        {c.finished ? (c.solved ? <>scored {c.score} on today&apos;s case. Read how to play below, then see if you can beat that.</> : <>couldn&apos;t crack today&apos;s case. Can you?</>) : <>challenged you to today&apos;s case.</>}
      </span>
    </div>
  );
}
