import fs from 'fs';
import path from 'path';
import { prisma } from '../db';

let isCleanupStarted = false;

export function startCleanupInterval() {
  if (isCleanupStarted) return;
  isCleanupStarted = true;

  console.log('[Cleanup] Startup: Initiated file cleanup daemon.');

  // Chạy định kỳ mỗi 5 phút
  setInterval(async () => {
    try {
      const now = new Date();
      
      // Tìm các job đã hết hạn
      const expiredJobs = await prisma.exportJob.findMany({
        where: {
          expiresAt: { lt: now }
        }
      });
      
      const workspaceRoot = process.cwd();
      
      for (const job of expiredJobs) {
        // 1. Xóa file ZIP kết quả
        if (job.zipPath && fs.existsSync(job.zipPath)) {
          try {
            fs.unlinkSync(job.zipPath);
            console.log(`[Cleanup] Removed expired ZIP: ${job.zipPath}`);
          } catch (e) {
            console.error(`Failed to delete ZIP file ${job.zipPath}:`, e);
          }
        }
        
        // 2. Xóa thư mục jobs tạm thời
        const jobDir = path.join(workspaceRoot, 'tmp', 'jobs', job.id);
        if (fs.existsSync(jobDir)) {
          try {
            fs.rmSync(jobDir, { recursive: true, force: true });
            console.log(`[Cleanup] Removed expired temp directory: ${jobDir}`);
          } catch (e) {
            console.error(`Failed to delete temp dir ${jobDir}:`, e);
          }
        }
      }
      
      // 3. Xóa các bản ghi DB tương ứng
      if (expiredJobs.length > 0) {
        const expiredIds = expiredJobs.map(j => j.id);
        await prisma.exportJob.deleteMany({
          where: {
            id: { in: expiredIds }
          }
        });
        console.log(`[Cleanup] Cleared ${expiredIds.length} expired job entries from database.`);
      }
    } catch (err) {
      console.error('[Cleanup] Error during periodic cleanup run:', err);
    }
  }, 5 * 60 * 1000); // Mỗi 5 phút
}
