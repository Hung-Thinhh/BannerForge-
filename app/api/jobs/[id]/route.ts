import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.exportJob.findUnique({
      where: { id }
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      projectId: job.projectId,
      templateId: job.templateId,
      status: job.status,
      totalItems: job.totalItems,
      doneItems: job.doneItems,
      error: job.error,
      expiresAt: job.expiresAt,
      // Trả về cờ kiểm tra zip có sẵn hay không
      hasZip: !!job.zipPath
    });
  } catch (err) {
    console.error('GET job status error:', err);
    return NextResponse.json({ error: 'Failed to fetch job status' }, { status: 500 });
  }
}
