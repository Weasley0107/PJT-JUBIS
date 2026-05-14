import { getMonthlyUsage } from '@/lib/db';

export async function GET() {
  const usage = getMonthlyUsage();
  return Response.json(usage);
}
