// Best-effort, per-instance sliding window. Good enough to stop a script hammering a single
// serverless instance; swap for Upstash/Redis if abuse shows up.
const hits = new Map<string, number[]>();

export function rateLimited(key: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(k);
  return recent.length > limit;
}
