// ============================================================================
// POST /api/studio/upload — Handle video file upload
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];
const CONTENT_DIR = join(process.cwd(), 'content', 'raw');

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'No file provided. Send a file in the "file" form field.' },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
        },
        { status: 400 },
      );
    }

    // Validate extension
    const originalName = file.name;
    const ext = originalName.substring(originalName.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Create date-based directory: content/raw/YYYY-MM-DD/
    const dateStr = new Date().toISOString().split('T')[0];
    const dirPath = join(CONTENT_DIR, dateStr);
    await mkdir(dirPath, { recursive: true });

    // Generate unique filename
    const fileId = uuidv4();
    const safeOrigName = originalName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/__+/g, '_');
    const fileName = `${fileId}_${safeOrigName}`;
    const filePath = join(dirPath, fileName);

    // Write file to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Return relative path from project root
    const relativePath = `content/raw/${dateStr}/${fileName}`;

    return NextResponse.json({
      success: true,
      data: {
        file_path: relativePath,
        original_name: originalName,
        size_bytes: file.size,
        size_mb: Math.round((file.size / (1024 * 1024)) * 100) / 100,
        mime_type: file.type,
        uploaded_at: new Date().toISOString(),
      },
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[api:studio/upload] POST error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
