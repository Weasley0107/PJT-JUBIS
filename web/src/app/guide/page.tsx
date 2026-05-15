'use client';

import { useRouter } from 'next/navigation';
import GuidePanel from '@/components/GuidePanel';

export default function GuidePage() {
  const router = useRouter();
  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950">
      <GuidePanel onClose={() => router.back()} />
    </div>
  );
}
