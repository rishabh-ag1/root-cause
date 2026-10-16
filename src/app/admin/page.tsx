import type { Metadata } from 'next';
import Link from 'next/link';
import { getAdmin } from '@/lib/admin';
import AdminDashboard from '@/components/admin/AdminDashboard';

export const metadata: Metadata = { title: 'Admin · Root Cause', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const admin = await getAdmin();
  if (!admin) {
    return (
      <main className="wrap" style={{ marginTop: 16 }}>
        <section className="page">
          <div className="tag">Admin</div>
          <h1>Admins only</h1>
          <p>Sign in with an admin account to see the dashboard.</p>
          <div className="accuse-row"><Link className="btn primary" href="/settings">Go to Account</Link></div>
        </section>
      </main>
    );
  }
  return <AdminDashboard />;
}
