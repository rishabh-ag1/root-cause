import 'server-only';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { currentUser } from './supabase/server';
import { getProfile, ConflictError } from './repo';
import { rateLimited } from './rateLimit';
import { GameError } from './game';

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);

/** Auth + username + rate limit + body validation for the write routes. */
export async function guardWrite<T>(req: Request, schema: ZodType<T>) {
  const user = await currentUser();
  if (!user) return { res: fail(401, 'auth', 'Sign in to play.') } as const;
  if (rateLimited('w:' + user.id)) return { res: fail(429, 'rate', 'Slow down a little.') } as const;
  const profile = await getProfile(user.id);
  if (!profile) return { res: fail(403, 'username', 'Pick a username first.') } as const;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { res: fail(400, 'body', 'Invalid JSON.') } as const;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { res: fail(400, 'body', 'Invalid request.') } as const;
  return { res: null, user, profile, body: parsed.data } as const;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export function handleError(e: unknown) {
  if (e instanceof GameError) return fail(409, e.code, e.message);
  if (e instanceof ConflictError) return fail(409, 'conflict', e.message);
  console.error(e);
  return fail(500, 'server', 'Something went wrong.');
}

/** The caller's IP for rate limiting. Uses Vercel's own headers, which clients can't spoof. */
export function clientIp(req: Request) {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    'unknown'
  );
}
