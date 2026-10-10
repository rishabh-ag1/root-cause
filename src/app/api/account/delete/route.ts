import { json, fail, handleError } from '@/lib/api';
import { adminClient, currentUser, userClient } from '@/lib/supabase/server';

/** Deletes the auth user. Profile and attempts go with it (on delete cascade). */
export async function POST() {
  const user = await currentUser();
  if (!user) return fail(401, 'auth', 'Sign in first.');
  try {
    const { error } = await adminClient().auth.admin.deleteUser(user.id);
    if (error) throw error;
    await (await userClient()).auth.signOut();
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
