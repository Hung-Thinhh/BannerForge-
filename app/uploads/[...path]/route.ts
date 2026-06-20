import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    
    // Giải quyết đường dẫn tuyệt đối đến file trong thư mục public/uploads
    const filePath = path.join(process.cwd(), 'public', 'uploads', ...pathSegments);
    
    // Bảo mật: Ngăn chặn tấn công Path Traversal (truy cập file ngoài thư mục uploads)
    const relativePath = path.relative(path.join(process.cwd(), 'public', 'uploads'), filePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return new NextResponse('Access Denied', { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return new NextResponse('File Not Found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    
    let contentType = 'application/octet-stream';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.gif') contentType = 'image/gif';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.error('Failed to serve static file:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
