import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const kind = (formData.get('kind') as string) || 'FRAME'; // BACKGROUND, FRAME, LOGO, etc.
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    
    // Kiểm tra định dạng file ảnh hợp lệ
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Format not supported. Only PNG, JPEG, WEBP, SVG' }, { status: 400 });
    }
    
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Tạo thư mục lưu trữ nếu chưa có
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'assets', projectId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Tạo tên file an toàn
    const ext = path.extname(file.name);
    const baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileName = `${Date.now()}_${baseName}${ext}`;
    const filePath = path.join(uploadDir, fileName);
    
    fs.writeFileSync(filePath, buffer);
    
    // Đọc kích thước ảnh bằng Sharp
    let width: number | null = null;
    let height: number | null = null;
    
    if (file.type !== 'image/svg+xml') {
      try {
        const meta = await sharp(buffer).metadata();
        width = meta.width || null;
        height = meta.height || null;
      } catch (e) {
        console.warn('Could not read image dimension:', e);
      }
    }
    
    const relativePath = `/uploads/assets/${projectId}/${fileName}`;
    
    // Ghi vào cơ sở dữ liệu
    const asset = await prisma.asset.create({
      data: {
        projectId,
        name: file.name,
        kind,
        path: relativePath,
        mimeType: file.type,
        width,
        height
      }
    });
    
    return NextResponse.json(asset);
  } catch (err) {
    console.error('POST asset error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    
    if (!assetId) {
      return NextResponse.json({ error: 'Missing assetId' }, { status: 400 });
    }
    
    // Tìm asset để lấy đường dẫn file
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, projectId }
    });
    
    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    
    // Xóa file vật lý
    const absolutePath = path.join(process.cwd(), 'public', asset.path);
    if (fs.existsSync(absolutePath)) {
      try {
        fs.unlinkSync(absolutePath);
      } catch (errFile) {
        console.error('Error deleting physical file:', errFile);
      }
    }
    
    // Xóa trong Database
    await prisma.asset.delete({
      where: { id: asset.id }
    });
    
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE asset error:', err);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
