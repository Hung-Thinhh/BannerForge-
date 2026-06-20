import type { Metadata } from 'next';
import { Outfit, Inter } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-outfit',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'BannerForge - Trình Tạo Banner Hàng Loạt Chuẩn SEO',
  description: 'Tạo hàng trăm banner sản phẩm chất lượng cao tự động từ template canvas, tối ưu hóa tên file SEO hình ảnh cho các sàn TMĐT và Catalog web.',
  keywords: 'tạo banner hàng loạt, banner generator, shopee, lazada, tiktok shop, seo hình ảnh, sharp image composite, fabric canvas editor',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={`${outfit.variable} ${inter.variable}`}>
      <head>
        {/* Nhúng font trực tiếp hỗ trợ render canvas canvas-editor */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col selection:bg-violet-500 selection:text-white">
        <header className="border-b border-zinc-800 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
          <div className="w-full px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform duration-200">
                BF
              </div>
              <div>
                <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-400">
                  BannerForge
                </span>
                <span className="text-[10px] block text-violet-400 font-semibold tracking-wider uppercase -mt-1">
                  SEO Batch Studio
                </span>
              </div>
            </a>
            
            <nav className="flex items-center gap-6">
              <a href="/" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
                Bảng điều khiển
              </a>
              <span className="text-zinc-700">|</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono">
                Self-Hosted v1.0.0
              </span>
            </nav>
          </div>
        </header>

        <main className="flex-1 flex flex-col">
          {children}
        </main>

        <footer className="border-t border-zinc-900 bg-[#050507] py-6 text-center text-xs text-zinc-600">
          <p>© {new Date().getFullYear()} BannerForge Studio. Ứng dụng nội bộ doanh nghiệp.</p>
        </footer>
      </body>
    </html>
  );
}
