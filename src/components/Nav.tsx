'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const ICON: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };
const LABEL: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

export default function Nav() {
  const path = usePathname();
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    try {
      const t = localStorage.getItem('rc-theme');
      if (t === 'light' || t === 'dark') setTheme(t);
    } catch {}
  }, []);

  function cycle() {
    const t = NEXT[theme];
    setTheme(t);
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      if (t === 'system') localStorage.removeItem('rc-theme');
      else localStorage.setItem('rc-theme', t);
    } catch {}
  }

  const link = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? 'page' : undefined}>
      {label}
    </Link>
  );

  return (
    <nav className="nav">
      <Link href="/" className="logo">
        <i>RC</i>
        <span className="hide-sm">Root Cause</span>
      </Link>
      <div className="nav-links">
        {link('/', 'Today')}
        {link('/leaderboard', 'Leaderboard')}
        {link('/settings', 'Account')}
        <button onClick={cycle} aria-label={`Theme: ${LABEL[theme]}`} title={`Theme: ${LABEL[theme]}`}>
          {ICON[theme]}<span className="hide-sm"> {LABEL[theme]}</span>
        </button>
      </div>
    </nav>
  );
}
