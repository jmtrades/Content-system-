// ============================================================================
// POST /api/captions/generate — Generate captions (SRT) for a video
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { getOllama } from '@/lib/ollama';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const captionSchema = z.object({
  video_path: z.string().min(1),
  language: z.string().default('en'),
  style: z.enum(['standard', 'animated', 'word_by_word', 'highlighted']).default('standard'),
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = captionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { video_path, language, style } = parsed.data;

    // Determine output SRT path
    const baseName = video_path.replace(/\.[^.]+$/, '');
    const srtPath = `${baseName}_captions.srt`;
    const absoluteSrtPath = join(process.cwd(), srtPath);

    // Use LLM to generate captions from the script associated with this video.
    // In production, this would use Whisper or similar STT service.
    // Here we generate placeholder SRT using the LLM for script-based captions.

    const ollama = getOllama();

    const prompt = `Generate SRT caption content for a short-form video.

Video path: ${video_path}
Language: ${language}
Caption style: ${style}

Generate a realistic SRT file with 8-12 caption segments for a 30-60 second video.
Each segment should be 2-4 seconds long with natural speech pacing.
Use this exact SRT format:

1
00:00:00,000 --> 00:00:03,000
First caption text

2
00:00:03,000 --> 00:00:06,000
Second caption text

Return ONLY the raw SRT content, no markdown code blocks.`;

    const srtContent = await ollama.generate('mistral', prompt, {
      temperature: 0.3,
      max_tokens: 1500,
    });

    // Clean up the generated SRT content
    const cleanedSrt = srtContent
      .replace(/```srt\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Ensure output directory exists
    await mkdir(dirname(absoluteSrtPath), { recursive: true });

    // Write SRT file
    await writeFile(absoluteSrtPath, cleanedSrt, 'utf-8');

    return NextResponse.json({
      success: true,
      data: {
        srt_path: srtPath,
        language,
        style,
        segments: cleanedSrt.split('\n\n').filter((s) => s.trim()).length,
        generated_at: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:captions/generate] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
