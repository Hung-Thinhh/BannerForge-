import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

// Lấy chi tiết dự án kèm theo quan hệ
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        assets: { orderBy: { createdAt: 'desc' } },
        products: { orderBy: { createdAt: 'desc' } },
        templates: { orderBy: { createdAt: 'desc' } },
        jobs: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (err) {
    console.error('GET project detail error:', err);
    return NextResponse.json({ error: 'Failed to fetch project detail' }, { status: 500 });
  }
}

// Cập nhật thông tin dự án
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, canvasWidth, canvasHeight, outputFormat, filenamePattern, altPattern } = body;

    const updated = await prisma.project.update({
      where: { id },
      data: {
        name,
        canvasWidth: canvasWidth !== undefined ? Number(canvasWidth) : undefined,
        canvasHeight: canvasHeight !== undefined ? Number(canvasHeight) : undefined,
        outputFormat,
        filenamePattern,
        altPattern
      }
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH project error:', err);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

// Xóa dự án và toàn bộ file đính kèm vật lý
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Xóa trong DB (cascade delete sẽ tự động xóa Template, Asset, Product, Job)
    await prisma.project.delete({
      where: { id }
    });

    // Xóa thư mục lưu asset vật lý của dự án
    const workspaceRoot = process.cwd();
    const projectAssetDir = path.join(workspaceRoot, 'public', 'uploads', 'assets', id);
    const projectProductDir = path.join(workspaceRoot, 'public', 'uploads', 'products', id);

    if (fs.existsSync(projectAssetDir)) {
      fs.rmSync(projectAssetDir, { recursive: true, force: true });
    }
    if (fs.existsSync(projectProductDir)) {
      fs.rmSync(projectProductDir, { recursive: true, force: true });
    }

    return NextResponse.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error('DELETE project error:', err);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
