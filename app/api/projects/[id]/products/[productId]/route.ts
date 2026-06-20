import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const { productId } = await params;
    const body = await request.json();
    const { name, slug, brand, category, color, price, originalPrice, discount } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        name,
        slug,
        brand,
        category,
        color,
        price,
        originalPrice,
        discount,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('PATCH product error:', err);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}
