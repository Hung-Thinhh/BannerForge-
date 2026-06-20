import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jobQueue } from '@/lib/queue/jobQueue';

// Tạo job xuất ảnh hàng loạt mới
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, templateId, productIds, filenamePattern, altPattern } = body; // Nhận thêm danh sách ID sản phẩm chọn lọc và cấu hình SEO

    if (!projectId || !templateId) {
      return NextResponse.json(
        { error: 'Missing projectId or templateId' },
        { status: 400 }
      );
    }

    // 1. Kiểm tra sự tồn tại của Project & Template
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { products: true }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.products.length === 0) {
      return NextResponse.json(
        { error: 'No products in this project. Please upload product images first.' },
        { status: 400 }
      );
    }

    const template = await prisma.template.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Tính tổng số sản phẩm sẽ được xuất
    const totalItems = (productIds && Array.isArray(productIds) && productIds.length > 0)
      ? productIds.length
      : project.products.length;

    // 2. Tạo bản ghi ExportJob
    const job = await prisma.exportJob.create({
      data: {
        projectId,
        templateId,
        status: 'PENDING',
        totalItems,
        doneItems: 0
      }
    });

    // 3. Đẩy vào hàng đợi xử lý nền không đồng bộ (không block request)
    jobQueue.addJob(job.id, projectId, templateId, productIds, filenamePattern, altPattern);

    return NextResponse.json(job);
  } catch (err) {
    console.error('POST job error:', err);
    return NextResponse.json(
      { error: 'Failed to create export job' },
      { status: 500 }
    );
  }
}
