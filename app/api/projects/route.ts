import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { startCleanupInterval } from '@/lib/queue/cleanup';

// Kích hoạt tiến trình dọn dẹp file tạm chạy nền ở API đầu tiên
startCleanupInterval();

// Lấy danh sách dự án
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(projects);
  } catch (err) {
    console.error('GET projects error:', err);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

// Tạo dự án mới
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, canvasWidth, canvasHeight, outputFormat, filenamePattern } = body;
    
    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        name,
        canvasWidth: Number(canvasWidth) || 1200,
        canvasHeight: Number(canvasHeight) || 1200,
        outputFormat: outputFormat || 'WEBP',
        filenamePattern: filenamePattern || '{productSlug}-khung-shopee'
      }
    });

    return NextResponse.json(project);
  } catch (err) {
    console.error('POST project error:', err);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
