import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Deployment check: reports which env vars are set (never their values). */
export function GET() {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'LAUNCH_DATE', 'NEXT_PUBLIC_SITE_URL'];
  const env = Object.fromEntries(names.map((n) => [n, !!process.env[n]?.trim()]));
  const ok = Object.values(env).every(Boolean);
  return NextResponse.json({ ok, env }, { status: ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
