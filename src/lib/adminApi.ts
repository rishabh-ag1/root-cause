import 'server-only';
import { fail } from './api';
import { getAdmin } from './admin';
import { rateLimited } from './rateLimit';

/** Admin routes: signed in, admin flag, light rate limit. Returns the user or a response to send. */
export async function guardAdmin() {
  const admin = await getAdmin();
  if (!admin) return { res: fail(403, 'forbidden', 'Admins only.') } as const;
  if (rateLimited('a:' + admin.id, 120)) return { res: fail(429, 'rate', 'Slow down a little.') } as const;
  return { res: null, admin } as const;
}
