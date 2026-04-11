// ============================================================================
// GET /api/studio/jobs — List video processing jobs with status filter
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const scriptId = searchParams.get('script_id');
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
    const offset = Number(searchParams.get('offset') ?? 0);

    const db = getDb();

    // Build jobs query
    let jobsQuery = db
      .from('video_jobs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) jobsQuery = jobsQuery.eq('status', status);
    if (scriptId) jobsQuery = jobsQuery.eq('script_id', scriptId);

    jobsQuery = jobsQuery.range(offset, offset + limit - 1);

    const { data: jobs, error: jobsErr, count } = await jobsQuery;

    if (jobsErr) {
      return NextResponse.json(
        { success: false, error: jobsErr.message },
        { status: 500 },
      );
    }

    // Fetch outputs for each job
    const jobIds = (jobs ?? []).map((j) => j.id);
    let outputs: Record<string, unknown>[] = [];

    if (jobIds.length > 0) {
      const { data: outputData } = await db
        .from('video_outputs')
        .select('*')
        .in('job_id', jobIds)
        .order('platform', { ascending: true });

      outputs = outputData ?? [];
    }

    // Group outputs by job_id
    const outputsByJob: Record<string, Record<string, unknown>[]> = {};
    for (const output of outputs) {
      const jid = output.job_id as string;
      if (!outputsByJob[jid]) outputsByJob[jid] = [];
      outputsByJob[jid].push(output);
    }

    // Combine jobs with their outputs
    const jobsWithOutputs = (jobs ?? []).map((job) => ({
      ...job,
      outputs: outputsByJob[job.id] ?? [],
    }));

    return NextResponse.json({
      success: true,
      data: {
        jobs: jobsWithOutputs,
        total: count ?? 0,
        limit,
        offset,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:studio/jobs] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
