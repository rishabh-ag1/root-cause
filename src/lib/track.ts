'use client';

type Clarity = ((...args: unknown[]) => void) & { q?: unknown[] };
declare global {
  interface Window {
    clarity?: Clarity;
  }
}

/**
 * Microsoft Clarity custom events and tags. No-ops when Clarity isn't loaded.
 * Never pass emails, codes or anything that identifies a person.
 */
export function track(event: string) {
  try {
    window.clarity?.('event', event);
  } catch {}
}

export function tag(key: string, value: string | number | boolean) {
  try {
    window.clarity?.('set', key, String(value));
  } catch {}
}
