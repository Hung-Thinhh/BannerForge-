import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { prisma } from '../db';
import { renderBanner, CanvasTemplateSchema, ProductData } from '../renderer/sharpRenderer';

export interface JobItem {
  jobId: string;
  projectId: string;
  templateId: string;
  productIds?: string[];
  filenamePattern?: string;
  altPattern?: string;
}

class InMemoryJobQueue {
  private queue: JobItem[] = [];
  private isProcessing = false;

  // Đẩy job mới vào hàng đợi
  public async addJob(
    jobId: string, 
    projectId: string, 
    templateId: string, 
    productIds?: string[], 
    filenamePattern?: string, 
    altPattern?: string
  ) {
    this.queue.push({ jobId, projectId, templateId, productIds, filenamePattern, altPattern });
    this.triggerProcessing();
  }

  // Kích hoạt xử lý hàng đợi
  private triggerProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.processNext();
  }

  // Xử lý job tiếp theo
  private async processNext() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    const currentJob = this.queue.shift()!;
    try {
      await this.runJob(currentJob);
    } catch (err) {
      console.error(`Error processing job ${currentJob.jobId}:`, err);
      await prisma.exportJob.update({
        where: { id: currentJob.jobId },
        data: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : String(err)
        }
      }).catch(console.error);
    }

    // Chuyển sang job tiếp theo
    this.processNext();
  }

  // Thực thi chi tiết một Job
  private async runJob(job: JobItem) {
    console.log(`[JobQueue] Starting job ${job.jobId}...`);
    
    // 1. Cập nhật trạng thái PROCESSING
    await prisma.exportJob.update({
      where: { id: job.jobId },
      data: { status: 'PROCESSING' }
    });

    // 2. Lấy thông tin Project, Template và danh sách sản phẩm
    const project = await prisma.project.findUnique({
      where: { id: job.projectId },
      include: { products: true }
    });

    const template = await prisma.template.findUnique({
      where: { id: job.templateId }
    });

    if (!project || !template) {
      throw new Error('Project or Template not found');
    }

    const templateSchema = JSON.parse(template.schema) as CanvasTemplateSchema;
    let products = project.products;

    // Chỉ render các sản phẩm được người dùng chỉ định
    if (job.productIds && job.productIds.length > 0) {
      products = products.filter(p => job.productIds!.includes(p.id));
    }

    if (products.length === 0) {
      throw new Error('No products found in this project to export');
    }

    // 3. Chuẩn bị thư mục render tạm thời
    // Thư mục lưu trữ: tmp/jobs/[jobId]/renders/
    const workspaceRoot = process.cwd();
    const tempJobDir = path.join(workspaceRoot, 'tmp', 'jobs', job.jobId);
    const rendersDir = path.join(tempJobDir, 'renders');
    
    if (fs.existsSync(tempJobDir)) {
      fs.rmSync(tempJobDir, { recursive: true, force: true });
    }
    fs.mkdirSync(rendersDir, { recursive: true });

    // 4. Render từng ảnh sản phẩm
    let doneCount = 0;
    const format = (project.outputFormat || 'WEBP').toLowerCase();
    const ext = format === 'jpeg' || format === 'jpg' ? 'jpg' : format;

    const filenamePattern = job.filenamePattern || project.filenamePattern || '{productSlug}';
    const altPattern = job.altPattern || '{productName}';

    // Mảng ghi CSV metadata SEO
    const csvRows = ['STT,Tên Sản Phẩm,Tên File Ảnh (SEO),Alt Text (SEO)'];
    const escapeCsv = (str: string) => {
      const escaped = String(str || '').replace(/"/g, '""');
      return `"${escaped}"`;
    };

    for (const prod of products) {
      // Chuẩn hóa đường dẫn ảnh sản phẩm gốc
      // Ảnh sản phẩm được lưu ở dạng /uploads/products/... trên client
      // Cần map về thư mục public vật lý để Sharp đọc được
      const relativeImagePath = prod.imagePath;
      const physicalImagePath = path.join(workspaceRoot, 'public', relativeImagePath);

      // Tạo cấu trúc dữ liệu cho Sharp Renderer
      const productData: ProductData = {
        name: prod.name,
        slug: prod.slug,
        imagePath: physicalImagePath,
        price: prod.price,
        originalPrice: prod.originalPrice,
        discount: prod.discount,
        brand: prod.brand,
        category: prod.category,
        color: prod.color
      };

      // Đặt tên file đầu ra chuẩn SEO
      const outputFilename = this.buildFilename(filenamePattern, prod, ext, doneCount + 1);
      const outputFilePath = path.join(rendersDir, outputFilename);

      // Giải quyết Alt Text (SEO) cho sản phẩm
      const altText = altPattern
        .replace('{productName}', prod.name || '')
        .replace('{productSlug}', prod.slug || '')
        .replace('{brand}', prod.brand || '')
        .replace('{category}', prod.category || '')
        .replace('{color}', prod.color || '');

      // Ghi hàng dữ liệu vào CSV
      csvRows.push(`${doneCount + 1},${escapeCsv(prod.name)},${escapeCsv(outputFilename)},${escapeCsv(altText)}`);

      // Tiến hành render ảnh
      await renderBanner({
        canvasWidth: project.canvasWidth,
        canvasHeight: project.canvasHeight,
        templateSchema,
        product: productData,
        outputFilePath,
        outputFormat: project.outputFormat
      });

      doneCount++;
      
      // Cập nhật tiến độ sau mỗi ảnh
      await prisma.exportJob.update({
        where: { id: job.jobId },
        data: { doneItems: doneCount }
      });
    }

    // Ghi file metadata SEO dạng CSV (kèm UTF-8 BOM)
    const csvContent = '\uFEFF' + csvRows.join('\n');
    fs.writeFileSync(path.join(rendersDir, 'seo-alt-metadata.csv'), csvContent, 'utf-8');

    // 5. Đóng gói ZIP
    console.log(`[JobQueue] Packaging ZIP for job ${job.jobId}...`);
    const exportsDir = path.join(workspaceRoot, 'tmp', 'exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const zipFilePath = path.join(exportsDir, `${job.jobId}.zip`);
    await this.zipDirectory(rendersDir, zipFilePath);

    // 6. Cập nhật trạng thái COMPLETED
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // Hết hạn sau 1 tiếng
    await prisma.exportJob.update({
      where: { id: job.jobId },
      data: {
        status: 'COMPLETED',
        zipPath: zipFilePath,
        expiresAt
      }
    });

    // 7. Xóa thư mục ảnh render tạm (chỉ giữ file ZIP xuất ra)
    try {
      if (fs.existsSync(rendersDir)) {
        fs.rmSync(rendersDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Failed to cleanup temp renders folder:', e);
    }

    console.log(`[JobQueue] Job ${job.jobId} completed successfully.`);
  }

  // Helper đặt tên file SEO
  private buildFilename(pattern: string, product: any, extension: string, index?: number): string {
    let name = pattern;

    // Kiểm tra xem pattern có các trường định danh độc nhất không để tránh trùng lặp
    const isUnique = pattern.includes('{productSlug}') || pattern.includes('{productId}') || (index !== undefined && pattern.includes('{index}'));

    if (index !== undefined) {
      name = name.replace('{index}', String(index));
    }

    name = name
      .replace('{productSlug}', product.slug || '')
      .replace('{productId}', product.id ? product.id.substring(0, 8) : '')
      .replace('{brand}', product.brand || '')
      .replace('{category}', product.category || '')
      .replace('{color}', product.color || '');

    // Nếu không chứa trường độc nhất, tự động append thêm slug/short id của sản phẩm
    if (!isUnique) {
      const suffix = product.slug || (product.id ? product.id.substring(0, 8) : 'id');
      name = `${name}-${suffix}`;
    }
      
    // Chuẩn hóa tên file: viết thường, loại bỏ ký tự lạ, dọn dẹp gạch ngang thừa
    name = name
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/g, '') // chỉ cho phép chữ, số, gạch ngang, gạch dưới
      .replace(/-+/g, '-')          // biến nhiều gạch ngang thành 1
      .replace(/^-+|-+$/g, '');     // bỏ gạch ngang ở đầu/cuối
      
    if (!name) {
      name = product.slug || 'product';
    }
    
    return `${name}.${extension}`;
  }

  // Helper nén ZIP thư mục
  private zipDirectory(sourceDir: string, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }
}

// Khởi tạo Singleton Instance
export const jobQueue = new InMemoryJobQueue();
