'use client';

import { useState, useEffect, use } from 'react';
import dynamic from 'next/dynamic';
import { 
  ArrowLeft, Palette, Image as ImageIcon, Sparkles, Download, 
  Trash2, Upload, Play, CheckCircle2, AlertTriangle, Loader2, RefreshCw,
  Check, ChevronDown, Edit
} from 'lucide-react';

// Dynamic import CanvasEditor để tránh lỗi SSR của Fabric.js
const CanvasEditor = dynamic(() => import('@/components/editor/CanvasEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 min-h-[500px] flex flex-col items-center justify-center text-zinc-500 border border-zinc-800 rounded-2xl bg-zinc-950/20">
      <Loader2 className="animate-spin text-violet-500 mb-3" size={32} />
      <p className="text-sm">Đang khởi tạo Canvas thiết kế kéo thả...</p>
    </div>
  )
});

// Hàm tạo slug thân thiện chuẩn SEO từ Tiếng Việt có dấu
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

interface Asset {
  id: string;
  name: string;
  kind: string;
  path: string;
  width?: number | null;
  height?: number | null;
}

interface Product {
  id: string;
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

interface Template {
  id: string;
  name: string;
  schema: string;
  isActive: boolean;
}

interface ExportJob {
  id: string;
  status: string;
  totalItems: number;
  doneItems: number;
  error?: string | null;
  expiresAt?: string | null;
  hasZip: boolean;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  outputFormat: string;
  filenamePattern: string;
  altPattern?: string;
  assets: Asset[];
  products: Product[];
  templates: Template[];
  jobs: ExportJob[];
}

export default function ProjectWorkspace({ params }: { params: Promise<{ id: string }> }) {
  // Giải quyết params của Next.js 15
  const { id: projectId } = use(params);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  
  // Trạng thái Uploading
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [uploadingProducts, setUploadingProducts] = useState(false);
  const [assetKind, setAssetKind] = useState('FRAME'); // FRAME, BACKGROUND, LOGO
  
  // Trạng thái Exporting & Polling
  const [exporting, setExporting] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  
  // Trạng thái local cho Input kích thước Canvas để tránh lag và lỗi gõ số
  const [inputWidth, setInputWidth] = useState<string>('');
  const [inputHeight, setInputHeight] = useState<string>('');
  const [showRatioDropdown, setShowRatioDropdown] = useState(false);

  // Trạng thái cấu hình tên file ảnh (SEO)
  const [filenamePattern, setFilenamePattern] = useState<string>('{productSlug}-khung-shopee');

  // Trạng thái sản phẩm đang chỉnh sửa (gõ tay)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // 1. Fetch dữ liệu dự án
  const fetchProjectDetails = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        setInputWidth(String(data.canvasWidth));
        setInputHeight(String(data.canvasHeight));
        if (data.filenamePattern) {
          setFilenamePattern(data.filenamePattern);
        }
        
        // Cập nhật danh sách ID sản phẩm chọn lọc xuất
        if (data.products) {
          const ids = data.products.map((p: any) => p.id);
          setSelectedProductIds((prev) => {
            if (prev.length === 0) return ids;
            // Giữ lại các ID cũ vẫn còn tồn tại và thêm các ID mới
            const filteredPrev = prev.filter(id => ids.includes(id));
            const brandNewIds = ids.filter((id: string) => !prev.includes(id));
            return [...filteredPrev, ...brandNewIds];
          });
        }
        
        // Kiểm tra xem dự án có job nào đang chạy không để theo dõi tiếp
        const runningJob = data.jobs?.find((j: any) => j.status === 'PENDING' || j.status === 'PROCESSING');
        if (runningJob) {
          setCurrentJobId(runningJob.id);
          setActiveJob(runningJob);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectDetails();
  }, [projectId]);

  // 2. Định kỳ kiểm tra (Polling) tiến độ Job nếu có
  useEffect(() => {
    if (!currentJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${currentJobId}`);
        if (res.ok) {
          const jobData = await res.json();
          setActiveJob(jobData);

          if (jobData.status === 'COMPLETED' || jobData.status === 'FAILED') {
            setCurrentJobId(null);
            // Re-fetch project details để lấy lịch sử job mới và liên kết zip
            fetchProjectDetails();
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 2000); // Check mỗi 2s

    return () => clearInterval(interval);
  }, [currentJobId]);

  // Thao tác: Upload Asset
  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAsset(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', assetKind);

      const res = await fetch(`/api/projects/${projectId}/assets`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const newAsset = await res.json();
        if (project) {
          setProject({
            ...project,
            assets: [newAsset, ...project.assets],
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingAsset(false);
    }
  };

  // Thao tác: Xóa Asset
  const handleDeleteAsset = async (assetId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa asset này khỏi thư viện?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/assets?assetId=${assetId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (project) {
          setProject({
            ...project,
            assets: project.assets.filter(a => a.id !== assetId),
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Thao tác: Upload nhiều ảnh sản phẩm
  const handleProductsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploadingProducts(true);
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }

      const res = await fetch(`/api/projects/${projectId}/products`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        await fetchProjectDetails(); // Tải lại toàn bộ dự án để nhận list sản phẩm mới
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingProducts(false);
    }
  };

  // Thao tác: Lưu Canvas Template JSON
  const handleSaveTemplate = async (schema: any) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema,
        }),
      });

      if (res.ok) {
        const newTemplate = await res.json();
        if (project) {
          // Gán template mới làm active và chèn vào list templates
          const updatedTemplates = project.templates.map(t => ({ ...t, isActive: false }));
          setProject({
            ...project,
            templates: [newTemplate, ...updatedTemplates]
          });
        }
        alert('Lưu thiết kế mẫu banner thành công!');
      }
    } catch (err) {
      console.error(err);
      alert('Không thể lưu thiết kế template.');
    }
  };

  // Thao tác: Trigger Export hàng loạt
  const handleTriggerExport = async () => {
    const activeTemplate = project?.templates?.find(t => t.isActive);
    if (!activeTemplate) {
      alert('Bạn phải lưu thiết kế mẫu banner (Save Template) trước khi xuất hàng loạt!');
      return;
    }
    if (!project?.products || project.products.length === 0) {
      alert('Dự án chưa có ảnh sản phẩm nào để xuất banner!');
      return;
    }
    if (selectedProductIds.length === 0) {
      alert('Vui lòng chọn ít nhất 1 ảnh sản phẩm để thực hiện xuất banner!');
      return;
    }

    try {
      setExporting(true);
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          templateId: activeTemplate.id,
          productIds: selectedProductIds, // Chỉ xuất các sản phẩm được chọn
          filenamePattern, // Cấu trúc tên file SEO
          altPattern: project?.altPattern || '{productName}', // Cấu trúc Alt Text SEO
        }),
      });

      if (res.ok) {
        const newJob = await res.json();
        setCurrentJobId(newJob.id);
        setActiveJob(newJob);
      } else {
        const err = await res.json();
        alert(err.error || 'Lỗi khi kích hoạt tiến trình xuất ảnh.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  // Thao tác: Xóa toàn bộ sản phẩm
  const handleClearProducts = async () => {
    if (!confirm('Bạn có muốn xóa sạch toàn bộ sản phẩm đã tải lên dự án này?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/products`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (project) {
          setProject({ ...project, products: [] });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Thao tác: Cập nhật kích thước Canvas
  const handleUpdateCanvasSize = async (width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvasWidth: width,
          canvasHeight: height,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject((prev) => prev ? { 
          ...prev, 
          canvasWidth: updated.canvasWidth, 
          canvasHeight: updated.canvasHeight 
        } : null);
        setInputWidth(String(updated.canvasWidth));
        setInputHeight(String(updated.canvasHeight));
      }
    } catch (err) {
      console.error('Update canvas size error:', err);
    }
  };

  // Thao tác: Cập nhật mẫu tên file SEO
  const handleUpdateFilenamePattern = async (filePat: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filenamePattern: filePat,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject((prev) => prev ? { 
          ...prev, 
          filenamePattern: updated.filenamePattern, 
        } : null);
      }
    } catch (err) {
      console.error('Update filename pattern error:', err);
    }
  };

  // Thao tác: Cập nhật định dạng ảnh xuất
  const handleUpdateOutputFormat = async (format: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outputFormat: format,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject((prev) => prev ? { 
          ...prev, 
          outputFormat: updated.outputFormat 
        } : null);
      }
    } catch (err) {
      console.error('Update output format error:', err);
    }
  };

  // Thao tác: Lưu chỉnh sửa sản phẩm (gõ tay)
  const handleSaveProductEdit = async () => {
    if (!editingProduct) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/products/${editingProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingProduct.name,
          slug: editingProduct.slug,
          brand: editingProduct.brand,
          category: editingProduct.category,
          color: editingProduct.color,
          price: editingProduct.price,
          originalPrice: editingProduct.originalPrice,
          discount: editingProduct.discount,
        }),
      });

      if (res.ok) {
        const updatedProduct = await res.json();
        if (project) {
          setProject({
            ...project,
            products: project.products.map((p) => p.id === updatedProduct.id ? updatedProduct : p),
          });
        }
        setEditingProduct(null);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Không thể lưu chỉnh sửa sản phẩm');
      }
    } catch (err) {
      console.error('Save product edit error:', err);
      alert('Đã xảy ra lỗi khi lưu thông tin sản phẩm');
    }
  };

  // Thao tác: Khớp kích thước Canvas theo tỷ lệ ảnh sản phẩm demo hoặc ảnh khung/nền
  const handleFitCanvasTo = (type: 'product' | 'frame') => {
    if (!project) return;

    if (type === 'product') {
      const firstProd = project.products[0];
      if (!firstProd) {
        alert('Dự án chưa có sản phẩm nào để lấy tỷ lệ.');
        return;
      }
      
      const img = new Image();
      img.src = firstProd.imagePath;
      img.onload = () => {
        handleUpdateCanvasSize(img.width, img.height);
      };
      img.onerror = () => {
        alert('Không thể tải ảnh sản phẩm để lấy kích thước.');
      };
    } else if (type === 'frame') {
      // Tìm asset dạng FRAME hoặc BACKGROUND
      const frameAsset = project.assets.find(a => a.kind === 'FRAME' || a.kind === 'BACKGROUND');
      if (!frameAsset) {
        alert('Dự án chưa tải lên Khung viền (Frame) hoặc Ảnh nền (Background) nào.');
        return;
      }

      const img = new Image();
      img.src = frameAsset.path;
      img.onload = () => {
        handleUpdateCanvasSize(img.width, img.height);
      };
      img.onerror = () => {
        alert('Không thể tải ảnh khung/nền để lấy kích thước.');
      };
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-zinc-500">
        <Loader2 className="animate-spin text-violet-500 mb-3" size={32} />
        <p className="text-sm font-semibold">Đang nạp không gian làm việc dự án...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-zinc-500">
        <AlertTriangle className="text-yellow-500 mb-3" size={32} />
        <p className="text-sm">Không tìm thấy thông tin dự án này.</p>
        <a href="/" className="mt-4 px-4 py-2 bg-zinc-900 border border-zinc-800 text-xs rounded-xl hover:text-white">
          Quay lại Bảng điều khiển
        </a>
      </div>
    );
  }

  const activeTemplate = project.templates?.find(t => t.isActive);

  return (
    <div className="w-full px-6 py-6 flex-1 flex flex-col">
      
      {/* Thanh công cụ điều hướng trên */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-zinc-900 pb-5">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="p-2.5 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-950/40 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </a>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              {project.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-500 mt-0.5">
              <div className="flex items-center gap-1.5 bg-zinc-900/60 border border-zinc-850 rounded-lg px-2 py-0.5 text-zinc-300">
                <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Canvas:</span>
                <input
                  type="number"
                  value={inputWidth}
                  onChange={(e) => setInputWidth(e.target.value)}
                  onBlur={() => {
                    const val = Number(inputWidth);
                    if (val > 0) {
                      handleUpdateCanvasSize(val, project.canvasHeight);
                    } else {
                      setInputWidth(String(project.canvasWidth));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = Number(inputWidth);
                      if (val > 0) {
                        handleUpdateCanvasSize(val, project.canvasHeight);
                      } else {
                        setInputWidth(String(project.canvasWidth));
                      }
                    }
                  }}
                  className="w-14 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-violet-500 rounded px-1.5 py-0.5 text-center text-xs text-white font-mono focus:outline-none"
                  title="Chiều rộng (px)"
                />
                <span className="text-[10px] text-zinc-600 font-bold">x</span>
                <input
                  type="number"
                  value={inputHeight}
                  onChange={(e) => setInputHeight(e.target.value)}
                  onBlur={() => {
                    const val = Number(inputHeight);
                    if (val > 0) {
                      handleUpdateCanvasSize(project.canvasWidth, val);
                    } else {
                      setInputHeight(String(project.canvasHeight));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = Number(inputHeight);
                      if (val > 0) {
                        handleUpdateCanvasSize(project.canvasWidth, val);
                      } else {
                        setInputHeight(String(project.canvasHeight));
                      }
                    }
                  }}
                  className="w-14 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-violet-500 rounded px-1.5 py-0.5 text-center text-xs text-white font-mono focus:outline-none"
                  title="Chiều cao (px)"
                />
                <span className="text-[10px] text-zinc-500 font-mono">px</span>
              </div>
              
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => setShowRatioDropdown(!showRatioDropdown)}
                  className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-850 hover:border-zinc-700 hover:bg-zinc-900 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-zinc-400 hover:text-white transition-all cursor-pointer"
                >
                  <Palette size={10} className="text-violet-400" />
                  <span>Khớp tỷ lệ...</span>
                  <ChevronDown size={8} />
                </button>
                {showRatioDropdown && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowRatioDropdown(false)}
                    />
                    <div className="absolute left-0 mt-1 w-44 rounded-xl bg-zinc-950 border border-zinc-850 shadow-2xl py-1 z-50 animate-in fade-in-50 slide-in-from-top-1 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          handleFitCanvasTo('product');
                          setShowRatioDropdown(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-[10px] text-zinc-300 hover:bg-zinc-900 hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <ImageIcon size={10} className="text-indigo-400" />
                        <span>Theo Ảnh Sản Phẩm</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleFitCanvasTo('frame');
                          setShowRatioDropdown(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-[10px] text-zinc-300 hover:bg-zinc-900 hover:text-white flex items-center gap-2 transition-colors border-t border-zinc-900 cursor-pointer"
                      >
                        <Palette size={10} className="text-emerald-400" />
                        <span>Theo Ảnh Khung / Nền</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
              
              <span>|</span>
              <span>Định dạng: <code className="text-violet-400 font-mono">{project.outputFormat}</code></span>
              <span>|</span>
              <span>Đặt tên: <code className="text-violet-400 font-mono">{project.filenamePattern}</code></span>
            </div>
          </div>
        </div>

        {/* Trạng thái Job đang chạy */}
        {activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'PROCESSING') && (
          <div className="flex items-center gap-4 bg-violet-950/20 border border-violet-850/40 rounded-xl px-4 py-2 animate-pulse">
            <Loader2 className="animate-spin text-violet-400" size={16} />
            <div className="text-xs">
              <span className="font-bold text-violet-300 block text-xs">Đang xuất ảnh hàng loạt...</span>
              <span className="text-zinc-500 font-mono mt-0.5 block text-[10px]">
                Tiến độ: {activeJob.doneItems} / {activeJob.totalItems} ảnh ({Math.round((activeJob.doneItems / activeJob.totalItems) * 100)}%)
              </span>
            </div>
            <div className="w-24 bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-violet-500 h-full transition-all duration-300"
                style={{ width: `${(activeJob.doneItems / activeJob.totalItems) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 1. KHU VỰC THIẾT KẾ CANVAS WORKSPACE (FULL WIDTH) */}
      <div className="flex-1 flex flex-col mb-10">
        <CanvasEditor
          projectId={project.id}
          canvasWidth={project.canvasWidth}
          canvasHeight={project.canvasHeight}
          assets={project.assets}
          products={project.products}
          activeTemplate={activeTemplate}
          onSaveTemplate={handleSaveTemplate}
          onChangeCanvasSize={handleUpdateCanvasSize}
        />
      </div>

      {/* 2. GRID QUẢN LÝ DỮ LIỆU DƯỚI CANVAS (KHÔNG CẦN CHUYỂN TABS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 border-t border-zinc-900 pt-8">
        
        {/* CỘT 1: QUẢN LÝ KHUNG VIỀN & ASSET (UPLOADER & GRID) */}
        <div className="lg:col-span-1 border border-zinc-800 bg-zinc-950/20 p-5 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-1.5">
              <ImageIcon size={16} className="text-violet-400" />
              1. Tải Lên Asset & Khung Viền
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
              {project.assets.length} file
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={assetKind}
                onChange={(e) => setAssetKind(e.target.value)}
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none"
              >
                <option value="FRAME">Khung viền đè trên (Frame)</option>
                <option value="BACKGROUND">Ảnh nền dưới (Background)</option>
                <option value="LOGO">Logo / Sticker</option>
              </select>

              <label className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-lg cursor-pointer transition-all">
                {uploadingAsset ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Upload size={14} />
                )}
                Upload File
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAssetUpload}
                  disabled={uploadingAsset}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[10px] text-zinc-500 leading-normal">
              Khung viền (Frame) PNG nền trong suốt sẽ xuất hiện trực tiếp trong mục **Khung viền & Asset** ở cột bên trái Trình thiết kế Canvas phía trên để bạn click chọn đưa vào bài thiết kế.
            </p>
          </div>

          {/* Grid hiển thị Assets hiện có */}
          <div className="flex-1 min-h-[220px] max-h-[320px] overflow-y-auto border border-zinc-900 bg-zinc-950/40 rounded-xl p-3">
            {project.assets.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-650 py-10">
                <ImageIcon size={28} className="mb-2 text-zinc-700" />
                <p className="text-[11px]">Chưa có khung viền nào. Hãy tải lên file đầu tiên.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {project.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="group border border-zinc-850 bg-zinc-900/10 hover:border-zinc-800 rounded-xl p-1.5 flex flex-col items-center justify-between text-center relative"
                  >
                    <button
                      onClick={() => handleDeleteAsset(asset.id)}
                      className="absolute top-1 right-1 p-1 rounded bg-zinc-950/80 hover:bg-red-950/60 border border-zinc-850 hover:border-red-900 text-zinc-500 hover:text-red-400 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Xóa tệp"
                    >
                      <Trash2 size={10} />
                    </button>
                    
                    <div className="h-14 w-full flex items-center justify-center bg-zinc-950/40 rounded-lg p-1 border border-zinc-900">
                      <img
                        src={asset.path}
                        alt={asset.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="text-[9px] text-zinc-400 truncate w-full px-0.5 mt-1 font-semibold">{asset.name}</span>
                    <span className="px-1 py-0.2 mt-0.5 rounded bg-zinc-900 text-[8px] text-zinc-500 uppercase font-mono">
                      {asset.kind}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CỘT 2: QUẢN LÝ DỮ LIỆU SẢN PHẨM (UPLOADER & GRID CHUNG) */}
        <div className="lg:col-span-1 border border-zinc-800 bg-zinc-950/20 p-5 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-1.5">
              <ImageIcon size={16} className="text-violet-400" />
              2. Danh Sách Ảnh Sản Phẩm
            </h3>
            <div className="flex items-center gap-2.5">
              {project.products.length > 0 && (
                <>
                  <button
                    onClick={() => {
                      const allSelected = selectedProductIds.length === project.products.length;
                      if (allSelected) {
                        setSelectedProductIds([]);
                      } else {
                        setSelectedProductIds(project.products.map(p => p.id));
                      }
                    }}
                    className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer transition-colors"
                  >
                    {selectedProductIds.length === project.products.length ? 'Bỏ chọn hết' : 'Chọn hết'}
                  </button>
                  <button
                    onClick={handleClearProducts}
                    className="p-1 rounded hover:bg-red-950/30 text-zinc-500 hover:text-red-400 border border-transparent hover:border-red-900/40 transition-colors"
                    title="Xóa tất cả sản phẩm"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                {selectedProductIds.length}/{project.products.length}
              </span>
            </div>
          </div>

          <div>
            <label className="flex items-center justify-center gap-2 w-full py-3.5 border-2 border-dashed border-zinc-800 hover:border-violet-500/50 bg-zinc-900/30 hover:bg-zinc-900/50 cursor-pointer rounded-xl transition-all">
              {uploadingProducts ? (
                <Loader2 className="animate-spin text-violet-500" size={16} />
              ) : (
                <Upload size={16} className="text-zinc-400" />
              )}
              <span className="text-xs font-bold text-zinc-300">Tải ảnh sản phẩm hàng loạt</span>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleProductsUpload}
                disabled={uploadingProducts}
                className="hidden"
              />
            </label>
            <p className="text-[10px] text-zinc-500 leading-normal mt-2">
              Click vào ảnh sản phẩm để **chọn/bỏ chọn** ảnh cần ghép viền khi xuất file ZIP.
            </p>
          </div>

          {/* Grid hiển thị sản phẩm hiện có */}
          <div className="flex-1 min-h-[220px] max-h-[320px] overflow-y-auto border border-zinc-900 bg-zinc-950/40 rounded-xl p-3">
            {project.products.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-zinc-650 py-10">
                <ImageIcon size={28} className="mb-2 text-zinc-700" />
                <p className="text-[11px]">Chưa có ảnh sản phẩm nào. Hãy tải lên ảnh gốc để bắt đầu ghép khung.</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {project.products.map((product) => {
                  const isChecked = selectedProductIds.includes(product.id);
                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        setSelectedProductIds((prev) =>
                          isChecked ? prev.filter((id) => id !== product.id) : [...prev, product.id]
                        );
                      }}
                      className={`group border rounded-xl p-1 flex flex-col relative cursor-pointer select-none transition-all ${
                        isChecked 
                          ? 'border-violet-500 bg-violet-950/10' 
                          : 'border-zinc-850/50 bg-zinc-900/10 hover:border-zinc-800'
                      }`}
                    >
                      {/* Checkbox ở góc trên bên trái */}
                      <div className="absolute top-1.5 left-1.5 z-10">
                        <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                          isChecked 
                            ? 'bg-violet-600 border-violet-500 text-white' 
                            : 'bg-zinc-950 border-zinc-800 text-transparent'
                        }`}>
                          {isChecked && <Check size={8} strokeWidth={3} />}
                        </div>
                      </div>

                      {/* Nút sửa thông tin sản phẩm ở góc trên bên phải */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingProduct(product);
                        }}
                        className="absolute top-1.5 right-1.5 p-1 rounded bg-zinc-950/80 hover:bg-violet-600 border border-zinc-800 hover:border-violet-500 text-zinc-400 hover:text-white z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Chỉnh sửa thông tin"
                      >
                        <Edit size={10} />
                      </button>

                      <div className="aspect-square w-full flex items-center justify-center bg-zinc-950 rounded-lg overflow-hidden border border-zinc-900">
                        <img
                          src={product.imagePath}
                          alt={product.name}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <span className="text-[8px] text-zinc-500 truncate w-full mt-1 px-0.5 text-center font-mono">
                        {product.slug}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* CỘT 3: XUẤT ẢNH BATCH ZIP & LỊCH SỬ JOB */}
        <div className="lg:col-span-1 border border-zinc-800 bg-zinc-950/20 p-5 rounded-2xl flex flex-col gap-4">
          <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-1.5">
            <Sparkles size={16} className="text-violet-400" />
            3. Xuất Bản & Tải File ZIP
          </h3>

          <div className="border border-zinc-900 bg-zinc-950/30 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Mẫu thiết kế (Template):</span>
              <span className="font-bold font-mono">
                {activeTemplate ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Đã lưu
                  </span>
                ) : (
                  <span className="text-amber-500 flex items-center gap-1">
                    <AlertTriangle size={12} /> Chưa lưu
                  </span>
                )}
              </span>
            </div>
            
            <div className="flex items-center justify-between text-xs border-t border-zinc-900 pt-2.5 pb-1">
              <span className="text-zinc-500">Số lượng ảnh xuất dự kiến:</span>
              <span className="font-bold text-violet-400 font-mono">
                {selectedProductIds.length} / {project.products.length} ảnh
              </span>
            </div>

            {/* Cấu hình Tên file ảnh (SEO) */}
            <div className="space-y-1.5 border-t border-zinc-900 pt-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex justify-between">
                <span>Cấu trúc tên file (SEO)</span>
                <span className="text-zinc-650 lowercase font-normal">Biến: &#123;productSlug&#125;, &#123;index&#125;, &#123;brand&#125;...</span>
              </label>
              <input
                type="text"
                value={filenamePattern}
                onChange={(e) => setFilenamePattern(e.target.value)}
                onBlur={() => handleUpdateFilenamePattern(filenamePattern)}
                placeholder="{productSlug}-khung-shopee"
                className="w-full px-3 py-2 text-xs bg-zinc-900/60 border border-zinc-850 rounded-xl text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-violet-500 transition-colors font-mono"
              />
            </div>

            {/* Cấu hình Định dạng file xuất (Format) */}
            <div className="space-y-1.5 pb-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex justify-between">
                <span>Định dạng file ảnh xuất</span>
              </label>
              <select
                value={project.outputFormat || 'WEBP'}
                onChange={(e) => handleUpdateOutputFormat(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-900/60 border border-zinc-850 rounded-xl text-zinc-250 focus:outline-none focus:border-violet-500 transition-colors font-sans cursor-pointer"
              >
                <option value="WEBP">WEBP (Tối ưu SEO, nhẹ)</option>
                <option value="JPEG">JPEG (Chất lượng cao)</option>
                <option value="PNG">PNG (Không nén, giữ nét nhất)</option>
              </select>
            </div>

            <button
              onClick={handleTriggerExport}
              disabled={exporting || !activeTemplate || project.products.length === 0 || selectedProductIds.length === 0 || !!currentJobId}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 mt-1 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xs text-white shadow-lg shadow-violet-600/20 transition-all active:scale-95"
            >
              {exporting ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Play size={14} fill="currentColor" />
              )}
              {currentJobId ? 'Đang ghép ảnh nền...' : 'Xuất Hàng Loạt File ZIP'}
            </button>
          </div>

          {/* Lịch sử và tải file ZIP */}
          <div className="flex-1 flex flex-col min-h-[200px] max-h-[300px] overflow-y-auto">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2.5">Lịch sử xuất file mới nhất</h4>
            
            {project.jobs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-zinc-700 border border-dashed border-zinc-900 rounded-xl py-6 bg-zinc-950/20">
                <Sparkles size={20} className="mb-1.5" />
                <p className="text-[10px]">Chưa thực hiện lượt xuất bản nào.</p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {project.jobs.map((job) => {
                  const isExpired = job.expiresAt ? new Date() > new Date(job.expiresAt) : false;
                  
                  return (
                    <div
                      key={job.id}
                      className="border border-zinc-900 bg-zinc-900/10 p-3 rounded-xl space-y-2 flex flex-col justify-between"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-[10px] font-mono text-zinc-400 font-bold">Mã Job: {job.id.substring(0, 8)}</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">{new Date(job.createdAt).toLocaleTimeString('vi-VN')} - Ghép xong {job.doneItems}/{job.totalItems} ảnh</div>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase font-mono ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-950/30 border border-emerald-900/50 text-emerald-400'
                            : job.status === 'FAILED'
                            ? 'bg-red-950/30 border border-red-900/50 text-red-400'
                            : 'bg-amber-950/30 border border-amber-900/50 text-amber-400 animate-pulse'
                        }`}>
                          {job.status}
                        </span>
                      </div>

                      {job.status === 'COMPLETED' && (
                        <div className="flex items-center justify-between border-t border-zinc-900/60 pt-2">
                          <span className={`text-[8px] font-bold uppercase ${isExpired ? 'text-red-400' : 'text-amber-500'}`}>
                            {isExpired ? 'Đã xóa file tự động' : 'Tự động xóa sau 1 giờ'}
                          </span>
                          
                          <a
                            href={isExpired ? '#' : `/api/downloads/${job.id}`}
                            onClick={(e) => {
                              if (isExpired) {
                                e.preventDefault();
                                alert('File ZIP này đã được hệ thống tự động xóa sạch để tiết kiệm bộ nhớ VPS.');
                              }
                            }}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold ${
                              isExpired 
                                ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed border border-zinc-800' 
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                            }`}
                          >
                            <Download size={10} />
                            Tải ZIP
                          </a>
                        </div>
                      )}

                      {job.error && (
                        <div className="text-[9px] text-red-400 font-mono">Lỗi: {job.error}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* MODAL CHỈNH SỬA SẢN PHẨM HÀNG LOẠT (GÕ TAY) */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
              <h3 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
                <Edit size={16} className="text-violet-400" />
                Chỉnh Sửa Thông Tin Sản Phẩm
              </h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="text-zinc-500 hover:text-white text-xs font-bold font-mono px-2 py-1 rounded hover:bg-zinc-900"
              >
                Đóng
              </button>
            </div>

            <div className="flex gap-4">
              <div className="w-20 h-20 flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shrink-0">
                <img
                  src={editingProduct.imagePath}
                  alt={editingProduct.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Đường dẫn ảnh</label>
                <div className="text-[9px] font-mono text-zinc-400 break-all select-all p-2 bg-zinc-900/60 border border-zinc-850 rounded-lg">
                  {editingProduct.imagePath}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Tên sản phẩm</label>
                <input
                  type="text"
                  value={editingProduct.name || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditingProduct((prev: any) => ({
                      ...prev,
                      name: val,
                      slug: slugify(val)
                    }));
                  }}
                  placeholder="Nhập tên sản phẩm"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-200 focus:outline-none focus:border-violet-500 font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Slug SEO (Filename)</label>
                <input
                  type="text"
                  value={editingProduct.slug || ''}
                  onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, slug: e.target.value }))}
                  placeholder="slug-san-pham"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-200 focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Thương hiệu (Brand)</label>
                <input
                  type="text"
                  value={editingProduct.brand || ''}
                  onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, brand: e.target.value }))}
                  placeholder="Ví dụ: Shopee"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Danh mục (Category)</label>
                <input
                  type="text"
                  value={editingProduct.category || ''}
                  onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, category: e.target.value }))}
                  placeholder="Ví dụ: Điện tử"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Màu sắc (Color)</label>
                <input
                  type="text"
                  value={editingProduct.color || ''}
                  onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, color: e.target.value }))}
                  placeholder="Ví dụ: Đỏ"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Khuyến mãi (Discount)</label>
                <input
                  type="text"
                  value={editingProduct.discount || ''}
                  onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, discount: e.target.value }))}
                  placeholder="Ví dụ: -20%"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Giá bán (Price)</label>
                <input
                  type="text"
                  value={editingProduct.price || ''}
                  onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, price: e.target.value }))}
                  placeholder="Ví dụ: 120.000đ"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-200 focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Giá gốc (Original Price)</label>
                <input
                  type="text"
                  value={editingProduct.originalPrice || ''}
                  onChange={(e) => setEditingProduct((prev: any) => ({ ...prev, originalPrice: e.target.value }))}
                  placeholder="Ví dụ: 150.000đ"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-200 focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-900">
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 text-xs font-semibold bg-zinc-900 hover:bg-zinc-850 text-zinc-400 rounded-xl transition-all"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSaveProductEdit}
                className="px-5 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-lg transition-all"
              >
                Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
