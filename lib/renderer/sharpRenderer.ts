import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

export interface CanvasLayer {
  id: string;
  type: 'image-slot' | 'asset-image' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  locked?: boolean;
  
  // Thuộc tính ảnh
  src?: string;      // Dành cho asset-image
  bind?: string;     // product.image (ảnh sản phẩm), product.name, product.price, v.v.
  fit?: 'contain' | 'cover';
  
  // Thuộc tính text
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  opacity?: number;
}

export interface CanvasTemplateSchema {
  version: number;
  canvas: {
    width: number;
    height: number;
    background?: string; // asset path hoặc mã màu Hex/RGB
  };
  layers: CanvasLayer[];
}

export interface ProductData {
  name: string;
  slug: string;
  imagePath: string;
  price?: string | null;
  originalPrice?: string | null;
  discount?: string | null;
  brand?: string | null;
  category?: string | null;
  color?: string | null;
}

// Hàm chia dòng text tự động (Word Wrapping)
function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  
  // Ước lượng chiều rộng trung bình của một ký tự (khoảng 50-60% kích thước font)
  const charWidthRatio = 0.55;
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * charWidthRatio)));
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length > maxChars) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Từ quá dài, bắt buộc phải ngắt
        lines.push(word);
        currentLine = '';
      }
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Trích xuất phần ảnh giao nhau giữa lớp đè (overlay) và canvas để tránh lỗi
 * Sharp "Image to composite must have same dimensions or smaller" khi layer
 * bị co giãn to hơn canvas hoặc nằm tràn ra ngoài lề canvas.
 */
async function getCroppedOverlay(
  sharpInstance: sharp.Sharp,
  left: number,
  top: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): Promise<{ buffer: Buffer; left: number; top: number } | null> {
  const intersectLeft = Math.max(0, left);
  const intersectTop = Math.max(0, top);
  const intersectRight = Math.min(canvasWidth, left + width);
  const intersectBottom = Math.min(canvasHeight, top + height);

  const intersectWidth = Math.round(intersectRight - intersectLeft);
  const intersectHeight = Math.round(intersectBottom - intersectTop);

  if (intersectWidth <= 0 || intersectHeight <= 0) {
    return null; // Nằm hoàn toàn ngoài lề canvas
  }

  const extractLeft = Math.round(intersectLeft - left);
  const extractTop = Math.round(intersectTop - top);

  let processed = sharpInstance;

  // Thực hiện cắt trích xuất (extract) nếu thực sự bị cắt viền
  if (
    extractLeft > 0 || 
    extractTop > 0 || 
    intersectWidth < Math.round(width) || 
    intersectHeight < Math.round(height)
  ) {
    processed = processed.extract({
      left: extractLeft,
      top: extractTop,
      width: intersectWidth,
      height: intersectHeight
    });
  }

  const buffer = await processed.toBuffer();
  return {
    buffer,
    left: intersectLeft,
    top: intersectTop
  };
}

/**
 * Render một banner duy nhất cho sản phẩm
 */
export async function renderBanner({
  canvasWidth,
  canvasHeight,
  templateSchema,
  product,
  outputFilePath,
  outputFormat = 'WEBP'
}: {
  canvasWidth: number;
  canvasHeight: number;
  templateSchema: CanvasTemplateSchema;
  product: ProductData;
  outputFilePath: string;
  outputFormat?: string;
}): Promise<void> {
  const layers = [...templateSchema.layers].sort((a, b) => a.zIndex - b.zIndex);
  const compositeQueue: sharp.OverlayOptions[] = [];
  
  // 1. Tạo ảnh nền base
  let backgroundOption: sharp.Create = {
    width: canvasWidth,
    height: canvasHeight,
    channels: 4,
    background: { r: 255, g: 255, b: 255, alpha: 1 } // Nền trắng mặc định
  };
  
  const bgValue = templateSchema.canvas.background;
  let bgImageBuffer: Buffer | null = null;
  
  if (bgValue) {
    if (bgValue.startsWith('#')) {
      // Đọc mã màu HEX
      const hex = bgValue.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      backgroundOption.background = { r, g, b, alpha: 1 };
    } else {
      // Nền là file ảnh nền, phân giải đường dẫn vật lý trong thư mục public
      const workspaceRoot = process.cwd();
      const bgPath = bgValue.startsWith('/')
        ? path.join(workspaceRoot, 'public', bgValue)
        : path.join(workspaceRoot, 'public', 'uploads', 'assets', bgValue);
        
      if (fs.existsSync(bgPath)) {
        bgImageBuffer = await sharp(bgPath)
          .resize(canvasWidth, canvasHeight, { fit: 'cover' })
          .toBuffer();
      } else {
        console.warn(`Background image not found: ${bgPath}`);
      }
    }
  }
  
  let mainSharp = sharp({ create: backgroundOption });
  
  if (bgImageBuffer) {
    compositeQueue.push({
      input: bgImageBuffer,
      top: 0,
      left: 0
    });
  }

  // 2. Duyệt qua từng layer và chuẩn bị composite
  for (const layer of layers) {
    try {
      const left = Math.round(layer.x);
      const top = Math.round(layer.y);
      const width = Math.round(layer.width);
      const height = Math.round(layer.height);
      
      if (width <= 0 || height <= 0) continue;
      
      if (layer.type === 'image-slot' && layer.bind === 'product.image') {
        // TẢI ẢNH SẢN PHẨM DYNAMIC
        const productImgPath = product.imagePath;
        if (!fs.existsSync(productImgPath)) {
          console.warn(`Product image not found: ${productImgPath}`);
          continue;
        }
        
        const fitMode = layer.fit || 'contain';
        const resizedProductImg = sharp(productImgPath)
          .resize(width, height, {
            fit: fitMode,
            background: { r: 0, g: 0, b: 0, alpha: 0 } // nền trong suốt cho contain
          });
          
        const cropped = await getCroppedOverlay(resizedProductImg, left, top, width, height, canvasWidth, canvasHeight);
        if (cropped) {
          compositeQueue.push({
            input: cropped.buffer,
            top: cropped.top,
            left: cropped.left,
            blend: 'over'
          });
        }
        
      } else if (layer.type === 'asset-image' && layer.src) {
        // TẢI ẢNH STATIC (Overlay Frame, Logo, Badge...)
        const relativeAssetPath = layer.src;
        const workspaceRoot = process.cwd();
        const assetPath = relativeAssetPath.startsWith('/')
          ? path.join(workspaceRoot, 'public', relativeAssetPath)
          : path.join(workspaceRoot, 'public', 'uploads', 'assets', relativeAssetPath);
          
        if (!fs.existsSync(assetPath)) {
          console.warn(`Asset image not found: ${assetPath}`);
          continue;
        }
        
        const resizedAsset = sharp(assetPath)
          .resize(width, height, {
            fit: 'fill'
          });
          
        const cropped = await getCroppedOverlay(resizedAsset, left, top, width, height, canvasWidth, canvasHeight);
        if (cropped) {
          compositeQueue.push({
            input: cropped.buffer,
            top: cropped.top,
            left: cropped.left,
            blend: 'over'
          });
        }
        
      } else if (layer.type === 'text') {
        // RENDER CHỮ ĐỘNG (SVG)
        let textValue = '';
        if (layer.bind) {
          const bindKey = layer.bind.replace('product.', '') as keyof ProductData;
          textValue = String(product[bindKey] || '');
        } else {
          textValue = 'Text';
        }
        
        if (!textValue) continue;
        
        // Cấu hình font
        const fontSize = layer.fontSize || 32;
        const color = layer.color || '#000000';
        const fontWeight = layer.fontWeight || 'normal';
        const fontFamily = layer.fontFamily || 'Arial';
        const align = layer.align || 'left';
        
        // Chia dòng
        const lines = wrapText(textValue, fontSize, width);
        const lineHeight = fontSize * 1.3;
        
        // Xác định toạ độ xuất phát văn bản trong SVG
        let textAnchor = 'start';
        let startX = 0;
        if (align === 'center') {
          textAnchor = 'middle';
          startX = width / 2;
        } else if (align === 'right') {
          textAnchor = 'end';
          startX = width;
        }
        
        // Chiều cao cần thiết cho văn bản
        const totalTextHeight = lines.length * lineHeight;
        // Căn lề giữa theo chiều dọc
        const startY = (height - totalTextHeight) / 2 + fontSize * 0.85;
        
        const svgContent = `
          <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <style>
              .txt {
                fill: ${color};
                font-family: "${fontFamily}", "Be Vietnam Pro", "Segoe UI", sans-serif;
                font-size: ${fontSize}px;
                font-weight: ${fontWeight};
                text-anchor: ${textAnchor};
              }
            </style>
            ${lines.map((line, idx) => `
              <text x="${startX}" y="${startY + idx * lineHeight}" class="txt">${escapeHtml(line)}</text>
            `).join('')}
          </svg>
        `;
        
        const textSharp = sharp(Buffer.from(svgContent));
        const cropped = await getCroppedOverlay(textSharp, left, top, width, height, canvasWidth, canvasHeight);
        if (cropped) {
          compositeQueue.push({
            input: cropped.buffer,
            top: cropped.top,
            left: cropped.left,
            blend: 'over'
          });
        }
      }
    } catch (err) {
      console.error(`Error processing layer ${layer.id}:`, err);
    }
  }
  
  // 3. Thực hiện gộp tất cả các lớp
  if (compositeQueue.length > 0) {
    mainSharp = mainSharp.composite(compositeQueue);
  }
  
  // 4. Xuất ảnh theo định dạng yêu cầu
  const outputDir = path.dirname(outputFilePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const format = outputFormat.toLowerCase();
  if (format === 'png') {
    await mainSharp.png({ quality: 90 }).toFile(outputFilePath);
  } else if (format === 'jpg' || format === 'jpeg') {
    await mainSharp.jpeg({ quality: 90 }).toFile(outputFilePath);
  } else {
    // Mặc định xuất WebP
    await mainSharp.webp({ quality: 85 }).toFile(outputFilePath);
  }
}
