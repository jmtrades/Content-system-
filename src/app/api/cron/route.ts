// ============================================================================
// GET  /api/cron — Master cron status (all jobs and their last run)
// POST /api/cron — Trigger a specific cron job by name
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const triggerSchema = z.object({
  job: z.enum([
    'radar_scan',
    'intel_scrape',
    'daily_scripts',
    'process_queue',
    'scrape_analytics',
    'weekly_optimization',
    'process_comments',
    'detect_trends',
  ]),
});

// ---------------------------------------------------------------------------
// Job definitions
// ---------------------------------------------------------------------------

interface CronJobDef {
  name: string;
  description: string;
  schedule: string;
  endpoint: string;
  method: string;
}

const CRON_JOBS: Record<string, CronJobDef> = {
  radar_scan: {
    name: 'radar_scan',
    description: 'Scan all configured sources for new AI content',
    schedule: '*/30 * * * *',
    endpoint: '/api/radar/scan',
    method: 'POST',
  },
  intel_scrape: {
    name: 'intel_scrape',
    description: 'Scrape competitor profiles and recent posts',
    schedule: '0 */6 * * *',
    endpoint: '/api/intel/scrape',
    method: 'POST',
  },
  daily_scripts: {
    name: 'daily_scripts',
    description: 'Generate scripts from top unprocessed radar items',
    schedule: '0 8 * * *',
    endpoint: '/api/scripts/generate',
    method: 'POST',
  },
  process_queue: {
    name: 'process_queue',
    description: 'Process the posting queue and publish scheduled posts',
    schedule: '*/5 * * * *',
    endpoint: '/api/distributor/post',
    method: 'POST',
  },
  scrape_analytics: {
    name: 'scrape_analytics',
    description: 'Collect analytics from all platforms',
    schedule: '0 */4 * * *',
    endpoint: '/api/analytics/scrape',
    method: 'POST',
  },
  weekly_optimization: {
    name: 'weekly_optimization',
    description: 'Run content optimization analysis',
    schedule: '0 9 * * 1',
    endpoint: '/api/analytics/optimize',
    method: 'POST',
  },
  process_comments: {
    name: 'process_comments',
    description: 'Fetch and classify new comments from all platforms',
    schedule: '0 */2 * * *',
    endpoint: '/api/community/comments',
    method: 'GET',
  },
  detect_trends: {
    name: 'detect_trends',
    description: 'Run trend detection and prediction analysis',
    schedule: '0 6,18 * * *',
    endpoint: '/api/trends/predict',
    method: 'POST',
  },
};

// ---------------------------------------------------------------------------
// GET handler — list all cron jobs with status
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  try {
    const db = getDb();

    // Fetch last run info for all jobs
    const { data: runHistory } = await db
      .from('cron_runs')
      .select('*')
      .order('started_at', { ascending: false });

    // Build a map of latest run per job
    const latestRuns: Record<string, Record<string, unknown>> = {};
    for (const run of runHistory ?? []) {
      const jobName = run.job_name as string;
      if (!latestRuns[jobName]) {
        latestRuns[jobName] = run;
      }
    }

    // Combine job definitions with run status
    const jobs = Object.entries(CRON_JOBS).map(([key, def]) => ({
      ...def,
      last_run: latestRuns[key]
        ? {
            started_at: latestRuns[key].started_at,
            completed_at: latestRuns[key].completed_at,
            status: latestRuns[key].status,
            result: latestRuns[key].result,
            error: latestRuns[key].error_message,
            duration_ms: latestRuns[key].duration_ms,
          }
        : null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        jobs,
        total: jobs.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:cron] GET error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler — trigger a specific cron job
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = triggerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const jobName = parsed.data.job;
    const jobDef = CRON_JOBS[jobName];

    if (!jobDef) {
      return NextResponse.json(
        { success: false, error: `Unknown job: ${jobName}` },
        { status: 404 },
      );
    }

    const db = getDb();
    const startedAt = new Date().toISOString();

    // Log cron run start
    const { data: cronRun } = await db
      .from('cron_runs')
      .insert({
        job_name: jobName,
        started_at: startedAt,
        status: 'running',
      })
      .select()
      .single();

    const runId = cronRun?.id;

    try {
      // Build the full URL for internal API call
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const url = `${baseUrl}${jobDef.endpoint}`;

      // Handle daily_scripts specially — need to pick top radar items
      let requestBody: string | undefined;
      if (jobName === 'daily_scripts') {
        const { data: topItems } = await db
          .from('radar_items')
          .select('id, title, category')
          .eq('processed', false)
          .order('importance_score', { ascending: false })
          .limit(3);

        if (topItems && topItems.length > 0) {
          const item = topItems[0];
          requestBody = JSON.stringify({
            topic: item.title,
            pillar: mapCategoryToPillar(item.category),
            radar_item_id: item.id,
          });
        }
      }

      // Handle process_queue — find due items
      if (jobName === 'process_queue') {
        const { data: dueItems } = await db
          .from('posting_queue')
          .select('id')
          .eq('status', 'scheduled')
          .lte('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1);

        if (dueItems && dueItems.length > 0) {
          requestBody = JSON.stringify({ queue_id: dueItems[0].id });
        } else {
          // Nothing to process
          if (runId) {
            await db.from('cron_runs').update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              result: { message: 'No items due for posting' },
              duration_ms: Date.now() - new Date(startedAt).getTime(),
            }).eq('id', runId);
          }

          return NextResponse.json({
            success: true,
            data: {
              job: jobName,
              status: 'completed',
              result: { message: 'No items due for posting' },
            },
          });
        }
      }

      const fetchOptions: RequestInit = {
        method: jobDef.method,
        headers: { 'Content-Type': 'application/json' },
      };

      if (jobDef.method === 'POST' && requestBody) {
        fetchOptions.body = requestBody;
      }

      const response = await fetch(url, fetchOptions);
      const result = await response.json();

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - new Date(startedAt).getTime();

      // Update cron run record
      if (runId) {
        await db.from('cron_runs').update({
          status: response.ok ? 'completed' : 'failed',
          completed_at: completedAt,
          result: result.data ?? null,
          error_message: response.ok ? null : (result.error ?? 'Unknown error'),
          duration_ms: durationMs,
        }).eq('id', runId);
      }

      return NextResponse.json({
        success: response.ok,
        data: {
          job: jobName,
          status: response.ok ? 'completed' : 'failed',
          duration_ms: durationMs,
          result: result.data ?? null,
          error: response.ok ? undefined : (result.error ?? 'Unknown error'),
        },
      });
    } catch (jobErr) {
      const errorMsg = jobErr instanceof Error ? jobErr.message : String(jobErr);

      // Update cron run with failure
      if (runId) {
        await db.from('cron_runs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMsg,
          duration_ms: Date.now() - new Date(startedAt).getTime(),
        }).eq('id', runId);
      }

      return NextResponse.json(
        {
          success: false,
          error: `Job ${jobName} failed: ${errorMsg}`,
          data: { job: jobName, status: 'failed' },
        },
        { status: 500 },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:cron] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Helper: map radar item category to content pillar
// ---------------------------------------------------------------------------

function mapCategoryToPillar(category: string): string {
  const mapping: Record<string, string> = {
    product_launch: 'ai_news',
    research_paper: 'ai_tutorials',
    funding: 'ai_news',
    open_source: 'ai_tools',
    regulation: 'ai_opinions',
    tutorial: 'ai_tutorials',
    opinion: 'ai_opinions',
    industry_news: 'ai_news',
    tool_update: 'ai_tools',
    drama: 'ai_drama',
    breakthrough: 'ai_news',
    hiring: 'ai_career',
    acquisition: 'ai_news',
  };

  return mapping[category] ?? 'ai_news';
}
