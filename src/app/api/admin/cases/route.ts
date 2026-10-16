import { json, handleError } from '@/lib/api';
import { guardAdmin } from '@/lib/adminApi';
import { listCasesForAdmin } from '@/lib/admin';
import { caseDay } from '@/lib/dates';
import { mailerConfigured } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await guardAdmin();
  if (g.res) return g.res;
  try {
    return json({ today: caseDay(), mailer: mailerConfigured(), cron: !!process.env.CRON_SECRET, cases: await listCasesForAdmin() });
  } catch (e) {
    return handleError(e);
  }
}
