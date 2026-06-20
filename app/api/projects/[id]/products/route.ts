import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

// Hàm chuẩn hóa tiếng Việt và tạo SEO slug
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD') // Tách tổ hợp dấu
    .replace(/[\u0300-\u036f]/g, '') // Xóa các dấu
    .replace(/[đĐ]/g, 'd') // Thay đ thành d
    .replace(/[^a-z0-9\s\-]/g, '') // Loại bỏ ký tự đặc biệt
    .trim()
    .replace(/\s+/g, '-'); // Thay khoảng trắng bằng dấu gạch ngang
}

// Upload danh sách sản phẩm hàng loạt (gửi nhiều file ảnh lên)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const formData = await request.formData();
    
    // Lấy tất cả các file ảnh gửi lên
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products', projectId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const createdProducts = [];

    for (const file of files) {
      if (!file.name || file.size === 0) continue;

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = path.extname(file.name);
      const originalName = path.basename(file.name, ext);
      
      // Tạo tên sản phẩm và slug
      const productName = originalName;
      const productSlug = slugify(productName);
      
      const fileName = `${Date.now()}_${productSlug}${ext}`;
      const filePath = path.join(uploadDir, fileName);
      
      fs.writeFileSync(filePath, buffer);
      
      const relativePath = `/uploads/products/${projectId}/${fileName}`;

      // Đọc các metadata bổ sung nếu có (ví dụ gửi kèm thuộc tính khác qua form data)
      const brand = formData.get(`${file.name}_brand`) as string || null;
      const category = formData.get(`${file.name}_category`) as string || null;
      const color = formData.get(`${file.name}_color`) as string || null;
      const price = formData.get(`${file.name}_price`) as string || null;
      const originalPrice = formData.get(`${file.name}_originalPrice`) as string || null;
      const discount = formData.get(`${file.name}_discount`) as string || null;

      const product = await prisma.product.create({
        data: {
          projectId,
          name: productName,
          slug: productSlug,
          imagePath: relativePath,
          brand,
          category,
          color,
          price,
          originalPrice,
          discount
        }
      });
      
      createdProducts.push(product);
    }

    return NextResponse.json({
      message: `Successfully uploaded ${createdProducts.length} products`,
      products: createdProducts
    });
  } catch (err) {
    console.error('POST products error:', err);
    return NextResponse.json({ error: 'Failed to upload products' }, { status: 500 });
  }
}

// Xóa toàn bộ sản phẩm trong dự án
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Xóa tất cả trong DB
    await prisma.product.deleteMany({
      where: { projectId }
    });

    // Xóa thư mục vật lý lưu ảnh sản phẩm của dự án này
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products', projectId);
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }

    return NextResponse.json({ message: 'All products cleared successfully' });
  } catch (err) {
    console.error('DELETE products error:', err);
    return NextResponse.json({ error: 'Failed to clear products' }, { status: 500 });
  }
}
