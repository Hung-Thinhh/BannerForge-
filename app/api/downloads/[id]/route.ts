import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Tìm thông tin Job
    const job = await prisma.exportJob.findUnique({
      where: { id }
    });

    if (!job || !job.zipPath) {
      return NextResponse.json({ error: 'Download not found or expired' }, { status: 404 });
    }

    // Kiểm tra hết hạn tải xuống
    if (job.expiresAt && new Date() > job.expiresAt) {
      return NextResponse.json({ error: 'Download link has expired' }, { status: 410 });
    }

    const physicalPath = job.zipPath;
    if (!fs.existsSync(physicalPath)) {
      return NextResponse.json({ error: 'ZIP file not found on server' }, { status: 404 });
    }

    // 2. Thiết lập stream để truyền dữ liệu file ZIP về client (tiết kiệm RAM)
    const fileStream = fs.createReadStream(physicalPath);
    const stat = fs.statSync(physicalPath);

    // Chuyển đổi Node stream sang Web ReadableStream tương thích Next.js
    const webStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      }
    });

    // 3. Trả về phản hồi tải xuống
    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="bannerforge_${id}.zip"`,
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err) {
    console.error('Download stream error:', err);
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }
}
