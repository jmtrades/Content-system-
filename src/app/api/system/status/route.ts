import { NextResponse } from 'next/server';
import { getStatus } from '@/lib/cron-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = getStatus();
  return NextResponse.json({
    success: true,
    ...status,
  });
}
