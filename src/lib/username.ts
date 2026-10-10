import { z } from 'zod';

// Deliberately short. Matches whole words and obvious leetspeak inside usernames.
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'rape', 'nazi',
  'chutiya', 'chutiye', 'bhenchod', 'behenchod', 'madarchod', 'mc', 'bc', 'gandu', 'randi', 'bsdk', 'lund', 'loda', 'lauda',
  'admin', 'moderator', 'rootcause', 'official',
];
const SHORT = new Set(['mc', 'bc']);

function normalise(s: string) {
  return s.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a');
}

export function isBlockedUsername(name: string) {
  const n = normalise(name);
  const parts = n.split('_');
  return BLOCKED.some((w) => (SHORT.has(w) ? parts.includes(w) : n.replace(/_/g, '').includes(w)));
}

export const Username = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, 'Use 3-20 letters, numbers or underscores.')
  .refine((s) => !isBlockedUsername(s), 'Please pick a different username.');
