import { NextResponse } from 'next/server';
import { ensureCronStarted, getStatus } from '@/lib/cron-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  const wasStarted = ensureCronStarted();
  const status = getStatus();
  return NextResponse.json({
    success: true,
    message: wasStarted ? 'Content Empire engine started' : 'Engine already running',
    ...status,
  });
}
