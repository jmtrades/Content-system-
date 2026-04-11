// ============================================================================
// POST /api/thumbnails/generate — Generate a thumbnail image
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const thumbnailSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(200).optional(),
  style: z.enum(['bold', 'minimal', 'gradient', 'dark', 'neon']),
  platform: z.enum(['tiktok', 'reels', 'youtube_shorts', 'linkedin', 'twitter']),
  output_format: z.enum(['png', 'jpeg', 'webp']).default('png'),
});

// ---------------------------------------------------------------------------
// Platform dimensions
// ---------------------------------------------------------------------------

const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
  tiktok: { width: 1080, height: 1920 },
  reels: { width: 1080, height: 1920 },
  youtube_shorts: { width: 1080, height: 1920 },
  linkedin: { width: 1080, height: 1920 },
  twitter: { width: 1920, height: 1080 },
};

// ---------------------------------------------------------------------------
// Style configurations
// ---------------------------------------------------------------------------

const STYLE_CONFIGS: Record<string, { bg: string; textColor: string; accentColor: string }> = {
  bold: { bg: '#FF0000', textColor: '#FFFFFF', accentColor: '#FFFF00' },
  minimal: { bg: '#FFFFFF', textColor: '#1A1A1A', accentColor: '#0066FF' },
  gradient: { bg: '#667EEA', textColor: '#FFFFFF', accentColor: '#764BA2' },
  dark: { bg: '#0F0F0F', textColor: '#FFFFFF', accentColor: '#00FF88' },
  neon: { bg: '#0D0D0D', textColor: '#00FFFF', accentColor: '#FF00FF' },
};

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = thumbnailSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { title, subtitle, style, platform, output_format } = parsed.data;
    const dims = PLATFORM_DIMENSIONS[platform];
    const styleConfig = STYLE_CONFIGS[style];

    // Escape XML special characters for SVG
    const escapeXml = (s: string) =>
      s.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const escapedTitle = escapeXml(title);
    const escapedSubtitle = subtitle ? escapeXml(subtitle) : '';

    // Build gradient background for gradient style
    const bgFill = style === 'gradient'
      ? `<defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${styleConfig.bg}"/><stop offset="100%" style="stop-color:${styleConfig.accentColor}"/></linearGradient></defs><rect width="${dims.width}" height="${dims.height}" fill="url(#bg)"/>`
      : `<rect width="${dims.width}" height="${dims.height}" fill="${styleConfig.bg}"/>`;

    // Calculate text positioning
    const titleY = subtitle ? dims.height * 0.42 : dims.height * 0.48;
    const subtitleY = dims.height * 0.55;
    const titleSize = Math.min(80, Math.floor(dims.width / (title.length * 0.5)));

    // Create SVG-based thumbnail
    const svg = `<svg width="${dims.width}" height="${dims.height}" xmlns="http://www.w3.org/2000/svg">
  ${bgFill}
  <text
    x="${dims.width / 2}" y="${titleY}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${titleSize}" font-weight="bold"
    fill="${styleConfig.textColor}"
    text-anchor="middle"
    dominant-baseline="middle"
  >${escapedTitle}</text>
  ${escapedSubtitle ? `<text
    x="${dims.width / 2}" y="${subtitleY}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${Math.floor(titleSize * 0.6)}"
    fill="${styleConfig.accentColor}"
    text-anchor="middle"
    dominant-baseline="middle"
  >${escapedSubtitle}</text>` : ''}
</svg>`;

    // Generate thumbnail with sharp
    const svgBuffer = Buffer.from(svg);
    let image = sharp(svgBuffer).resize(dims.width, dims.height);

    let mimeType: string;
    let extension: string;

    switch (output_format) {
      case 'jpeg':
        image = image.jpeg({ quality: 90 });
        mimeType = 'image/jpeg';
        extension = 'jpg';
        break;
      case 'webp':
        image = image.webp({ quality: 90 });
        mimeType = 'image/webp';
        extension = 'webp';
        break;
      default:
        image = image.png();
        mimeType = 'image/png';
        extension = 'png';
        break;
    }

    const imageBuffer = await image.toBuffer();

    // Save to disk
    const dateStr = new Date().toISOString().split('T')[0];
    const thumbDir = join(process.cwd(), 'content', 'thumbnails', dateStr);
    await mkdir(thumbDir, { recursive: true });

    const fileName = `thumb_${Date.now()}.${extension}`;
    const filePath = join(thumbDir, fileName);
    const relativePath = `content/thumbnails/${dateStr}/${fileName}`;

    await sharp(imageBuffer).toFile(filePath);

    return NextResponse.json({
      success: true,
      data: {
        path: relativePath,
        width: dims.width,
        height: dims.height,
        format: output_format,
        size_bytes: imageBuffer.length,
        style,
        platform,
        generated_at: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:thumbnails/generate] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
