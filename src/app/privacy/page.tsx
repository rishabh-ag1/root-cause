import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy · Root Cause' };

export default function Privacy() {
  return (
    <main className="wrap" style={{ marginTop: 16 }}>
      <section className="page">
        <div className="tag">Privacy notice</div>
        <h1>What we store, and why</h1>
        <p><b>What:</b> your email address, the username you pick, and your game results (which files you opened, your accusations, time and score).</p>
        <p><b>Why:</b> to sign you in, to rank you on the leaderboard, and to send you your daily result if you choose to get it.</p>
        <p><b>Who sees it:</b> only your username and results appear publicly. Your email is never shown. We don&apos;t sell your data.</p>
        <p><b>Your control:</b> you can delete your account and every result from the Account page at any time.</p>
        <p><b>Analytics:</b> we use PostHog (usage statistics such as daily players and which files get opened) Google Analytics (visits and traffic sources) and Microsoft Clarity (clicks, scrolling and anonymised session replays) to understand how people use the site so we can make the game better. Signed-in players are linked to an internal ID, never their email. Text you type, like your email and sign-in code, is masked and never recorded. They set cookies for this. See <a href="https://posthog.com/privacy">PostHog&apos;s</a> , <a href="https://policies.google.com/privacy">Google&apos;s</a> and <a href="https://privacy.microsoft.com/privacystatement">Microsoft&apos;s</a> privacy statements.</p>
        <p><b>Phone number:</b> we don&apos;t ask for one.</p>
      </section>
    </main>
  );
}
