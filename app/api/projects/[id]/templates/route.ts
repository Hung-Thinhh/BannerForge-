import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Lấy template đang hoạt động của dự án
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const template = await prisma.template.findFirst({
      where: { projectId, isActive: true }
    });
    return NextResponse.json(template || null);
  } catch (err) {
    console.error('GET template error:', err);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

// Lưu hoặc cập nhật template cho dự án
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { name, schema } = body;

    if (!schema) {
      return NextResponse.json({ error: 'Schema is required' }, { status: 400 });
    }

    // Hủy kích hoạt tất cả các template cũ của dự án
    await prisma.template.updateMany({
      where: { projectId },
      data: { isActive: false }
    });

    // Tạo template mới làm template kích hoạt chính
    const newTemplate = await prisma.template.create({
      data: {
        projectId,
        name: name || 'Main Template',
        schema: typeof schema === 'string' ? schema : JSON.stringify(schema),
        isActive: true
      }
    });

    return NextResponse.json(newTemplate);
  } catch (err) {
    console.error('POST template error:', err);
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 });
  }
}
