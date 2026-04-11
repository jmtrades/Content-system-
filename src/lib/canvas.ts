// ============================================================================
// Thumbnail / Cover Image Generation (using sharp)
// ============================================================================

import sharp from 'sharp';
import type { Platform, ThumbnailStyle } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThumbnailConfig {
  title: string;
  subtitle?: string;
  style: ThumbnailStyle;
  platform: Platform;
  background?: string;       // Path to a background image file
  backgroundColor?: string;  // Hex colour, e.g. '#1a1a2e'
  accentColor?: string;      // Hex colour for accents / gradient
  fontSize?: number;         // Override default title font size
  outputPath?: string;       // If not set, returns buffer only
}

export interface PlatformDimensions {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Platform dimensions
// ---------------------------------------------------------------------------

const PLATFORM_SIZES: Record<Platform, PlatformDimensions> = {
  tiktok:          { width: 1080, height: 1920 },
  reels:           { width: 1080, height: 1920 },
  youtube_shorts:  { width: 1280, height: 720 },
  linkedin:        { width: 1200, height: 627 },
  twitter:         { width: 1200, height: 675 },
};

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function hexToRgba(hex: string, alpha: number = 1): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// SVG builders (one per style)
// ---------------------------------------------------------------------------

function buildGradientSvg(
  width: number,
  height: number,
  title: string,
  subtitle: string | undefined,
  bgColor: string,
  accentColor: string,
  fontSize: number,
): string {
  const escapedTitle = escapeXml(title);
  const escapedSubtitle = subtitle ? escapeXml(subtitle) : '';
  const titleY = subtitle ? height * 0.42 : height * 0.48;
  const subtitleY = titleY + fontSize + 30;
  const maxWidth = width * 0.85;

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${bgColor}" />
      <stop offset="100%" style="stop-color:${accentColor}" />
    </linearGradient>
    <linearGradient id="accent-line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${accentColor};stop-opacity:0" />
      <stop offset="50%" style="stop-color:${accentColor}" />
      <stop offset="100%" style="stop-color:${accentColor};stop-opacity:0" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect x="${width * 0.1}" y="${titleY - fontSize - 10}" width="${width * 0.8}" height="3" fill="url(#accent-line)" rx="1" />
  <text x="${width / 2}" y="${titleY}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="white" text-anchor="middle" textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs">
    ${wrapSvgText(escapedTitle, fontSize, maxWidth, width / 2, titleY)}
  </text>
  ${escapedSubtitle ? `
  <text x="${width / 2}" y="${subtitleY}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(fontSize * 0.5)}" fill="${hexToRgba('#ffffff', 0.8)}" text-anchor="middle">
    ${escapedSubtitle}
  </text>` : ''}
  <rect x="${width * 0.1}" y="${(subtitle ? subtitleY : titleY) + 30}" width="${width * 0.8}" height="3" fill="url(#accent-line)" rx="1" />
</svg>`;
}

function buildBoldSvg(
  width: number,
  height: number,
  title: string,
  subtitle: string | undefined,
  bgColor: string,
  accentColor: string,
  fontSize: number,
): string {
  const escapedTitle = escapeXml(title);
  const escapedSubtitle = subtitle ? escapeXml(subtitle) : '';
  const titleY = subtitle ? height * 0.4 : height * 0.48;
  const subtitleY = titleY + fontSize + 40;
  const maxWidth = width * 0.8;

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}" />
  <rect x="0" y="0" width="${width * 0.02}" height="${height}" fill="${accentColor}" />
  <rect x="${width * 0.98}" y="0" width="${width * 0.02}" height="${height}" fill="${accentColor}" />
  <rect x="0" y="${height * 0.92}" width="${width}" height="${height * 0.08}" fill="${accentColor}" />
  <text x="${width / 2}" y="${titleY}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900" fill="white" text-anchor="middle" letter-spacing="2">
    ${wrapSvgText(escapedTitle, fontSize, maxWidth, width / 2, titleY)}
  </text>
  ${escapedSubtitle ? `
  <text x="${width / 2}" y="${subtitleY}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(fontSize * 0.45)}" fill="${hexToRgba('#ffffff', 0.7)}" text-anchor="middle">
    ${escapedSubtitle}
  </text>` : ''}
</svg>`;
}

function buildMinimalSvg(
  width: number,
  height: number,
  title: string,
  subtitle: string | undefined,
  bgColor: string,
  accentColor: string,
  fontSize: number,
): string {
  const escapedTitle = escapeXml(title);
  const escapedSubtitle = subtitle ? escapeXml(subtitle) : '';
  const titleY = subtitle ? height * 0.45 : height * 0.50;
  const subtitleY = titleY + fontSize + 20;
  const maxWidth = width * 0.75;

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${bgColor}" />
  <text x="${width / 2}" y="${titleY}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="600" fill="white" text-anchor="middle">
    ${wrapSvgText(escapedTitle, fontSize, maxWidth, width / 2, titleY)}
  </text>
  ${escapedSubtitle ? `
  <text x="${width / 2}" y="${subtitleY}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(fontSize * 0.45)}" fill="${accentColor}" text-anchor="middle">
    ${escapedSubtitle}
  </text>` : ''}
</svg>`;
}

function buildOverlaySvg(
  width: number,
  height: number,
  title: string,
  subtitle: string | undefined,
  _bgColor: string,
  accentColor: string,
  fontSize: number,
): string {
  const escapedTitle = escapeXml(title);
  const escapedSubtitle = subtitle ? escapeXml(subtitle) : '';
  const boxHeight = subtitle ? height * 0.35 : height * 0.25;
  const boxY = height - boxHeight;
  const titleY = boxY + boxHeight * 0.45;
  const subtitleY = titleY + fontSize + 20;
  const maxWidth = width * 0.85;

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="overlay-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:rgba(0,0,0,0)" />
      <stop offset="30%" style="stop-color:rgba(0,0,0,0.6)" />
      <stop offset="100%" style="stop-color:rgba(0,0,0,0.95)" />
    </linearGradient>
  </defs>
  <rect x="0" y="${boxY}" width="${width}" height="${boxHeight}" fill="url(#overlay-grad)" />
  <rect x="${width * 0.05}" y="${boxY + 20}" width="4" height="${boxHeight - 40}" fill="${accentColor}" rx="2" />
  <text x="${width / 2}" y="${titleY}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle">
    ${wrapSvgText(escapedTitle, fontSize, maxWidth, width / 2, titleY)}
  </text>
  ${escapedSubtitle ? `
  <text x="${width / 2}" y="${subtitleY}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(fontSize * 0.45)}" fill="${hexToRgba('#ffffff', 0.75)}" text-anchor="middle">
    ${escapedSubtitle}
  </text>` : ''}
</svg>`;
}

// ---------------------------------------------------------------------------
// Text wrapping helper
// ---------------------------------------------------------------------------

/**
 * Approximate multi-line SVG text by splitting into <tspan> elements.
 * SVG doesn't natively wrap text, so we estimate based on character width.
 */
function wrapSvgText(
  text: string,
  fontSize: number,
  maxWidth: number,
  x: number,
  startY: number,
): string {
  // Rough heuristic: each character is ~0.55 of font size wide
  const charWidth = fontSize * 0.55;
  const maxCharsPerLine = Math.floor(maxWidth / charWidth);
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (test.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Center the text block vertically around startY
  const lineHeight = fontSize * 1.25;
  const totalHeight = (lines.length - 1) * lineHeight;
  const adjustedStartY = startY - totalHeight / 2;

  return lines
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}"${i === 0 ? ` y="${adjustedStartY}"` : ''}>${line}</tspan>`,
    )
    .join('');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

const STYLE_BUILDERS: Record<
  ThumbnailStyle,
  (
    w: number,
    h: number,
    title: string,
    subtitle: string | undefined,
    bg: string,
    accent: string,
    fs: number,
  ) => string
> = {
  gradient: buildGradientSvg,
  bold: buildBoldSvg,
  minimal: buildMinimalSvg,
  overlay: buildOverlaySvg,
};

/**
 * Generate a thumbnail / cover image.
 *
 * Returns a Buffer containing the PNG image. If `config.outputPath` is set,
 * also writes the image to disk.
 */
export async function generateThumbnail(config: ThumbnailConfig): Promise<Buffer> {
  const dims = PLATFORM_SIZES[config.platform] ?? PLATFORM_SIZES.youtube_shorts;
  const { width, height } = dims;

  const bgColor = config.backgroundColor ?? '#1a1a2e';
  const accentColor = config.accentColor ?? '#e94560';

  // Choose a default font size based on platform orientation
  const isVertical = height > width;
  const defaultFontSize = isVertical ? Math.round(width * 0.07) : Math.round(height * 0.09);
  const fontSize = config.fontSize ?? defaultFontSize;

  // Build the SVG overlay
  const builder = STYLE_BUILDERS[config.style] ?? STYLE_BUILDERS.gradient;
  const svg = builder(width, height, config.title, config.subtitle, bgColor, accentColor, fontSize);
  const svgBuffer = Buffer.from(svg);

  let image: sharp.Sharp;

  if (config.background) {
    // Use the provided background image, resized to fill
    image = sharp(config.background)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .composite([{ input: svgBuffer, top: 0, left: 0 }]);
  } else {
    // Create a solid colour base and composite the SVG on top
    image = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: bgColor,
      },
    }).composite([{ input: svgBuffer, top: 0, left: 0 }]);
  }

  const buffer = await image.png({ quality: 90 }).toBuffer();

  if (config.outputPath) {
    const fs = await import('fs/promises');
    const path = await import('path');
    await fs.mkdir(path.dirname(config.outputPath), { recursive: true });
    await fs.writeFile(config.outputPath, buffer);
  }

  return buffer;
}

/**
 * Get the platform-specific dimensions.
 */
export function getPlatformDimensions(platform: Platform): PlatformDimensions {
  return PLATFORM_SIZES[platform] ?? PLATFORM_SIZES.youtube_shorts;
}
