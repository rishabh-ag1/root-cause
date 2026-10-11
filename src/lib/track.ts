'use client';
import posthog from 'posthog-js';

type Clarity = ((...args: unknown[]) => void) & { q?: unknown[] };
declare global {
  interface Window {
    clarity?: Clarity;
  }
}

type Props = Record<string, string | number | boolean | null>;

const posthogReady = () => typeof window !== 'undefined' && posthog.__loaded;

/**
 * Sends a product event to PostHog (numbers: DAU, retention, funnels) and Clarity (recordings).
 * No-ops when neither is loaded. Never pass emails, codes or anything that identifies a person.
 */
export function track(event: string, props?: Props) {
  try {
    window.clarity?.('event', event);
  } catch {}
  try {
    if (posthogReady()) posthog.capture(event, props);
  } catch {}
}

/** A session-level tag in Clarity and a super property on every later PostHog event. */
export function tag(key: string, value: string | number | boolean) {
  try {
    window.clarity?.('set', key, String(value));
  } catch {}
  try {
    if (posthogReady()) posthog.register({ [key]: value });
  } catch {}
}

/** Ties this browser to the signed-in player (by internal user id, never email) so retention follows people across devices. */
export function identify(userId: string, username: string | null) {
  try {
    if (posthogReady() && posthog.get_distinct_id() !== userId) posthog.identify(userId, username ? { username } : undefined);
    window.clarity?.('identify', userId);
  } catch {}
}

export function resetIdentity() {
  try {
    if (posthogReady()) posthog.reset();
  } catch {}
}
