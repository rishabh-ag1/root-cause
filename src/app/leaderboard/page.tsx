import type { Metadata } from 'next';
import Leaderboard from '@/components/Leaderboard';

export const metadata: Metadata = { title: 'Leaderboard · Root Cause' };

export default function LeaderboardPage() {
  return <Leaderboard />;
}
