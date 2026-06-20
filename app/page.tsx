'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, FolderOpen, ArrowRight, Loader2, Image as ImageIcon } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  outputFormat: string;
  filenamePattern: string;
  createdAt: string;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  
  // Trạng thái Form tạo mới
  const [name, setName] = useState('');
  const [preset, setPreset] = useState('shopee'); // shopee, tiktok, custom
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(1200);
  const [format, setFormat] = useState('WEBP');
  const [pattern, setPattern] = useState('{productSlug}-khung-shopee');
  const [showModal, setShowModal] = useState(false);

  // Fetch danh sách dự án
  const fetchProjects = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Thay đổi preset kích thước canvas
  const handlePresetChange = (val: string) => {
    setPreset(val);
    if (val === 'shopee') {
      setWidth(1200);
      setHeight(1200);
      setPattern('{productSlug}-khung-shopee');
    } else if (val === 'tiktok') {
      setWidth(1000);
      setHeight(1000);
      setPattern('{productSlug}-tiktok-sale');
    } else {
      // Custom
      setWidth(1200);
      setHeight(1200);
    }
  };

  // Tạo dự án mới
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setCreating(true);
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          canvasWidth: width,
          canvasHeight: height,
          outputFormat: format,
          filenamePattern: pattern,
        }),
      });

      if (res.ok) {
        const newProj = await res.json();
        setProjects([newProj, ...projects]);
        setShowModal(false);
        // Reset form
        setName('');
        setPreset('shopee');
        setWidth(1200);
        setHeight(1200);
        setFormat('WEBP');
        setPattern('{productSlug}-khung-shopee');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  // Xóa dự án
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm('Bạn có chắc chắn muốn xóa dự án này? Toàn bộ file ảnh, mẫu thiết kế liên quan sẽ bị xóa vĩnh viễn.')) return;

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProjects(projects.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 w-full flex-1 flex flex-col">
      {/* Header Dashboard */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Chào mừng đến với <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400">BannerForge</span>
          </h1>
          <p className="text-zinc-400 mt-2 text-sm md:text-base">
            Quản lý các dự án tạo khung ảnh sản phẩm hàng loạt và tối ưu SEO cho shop của bạn.
          </p>
        </div>
        
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold text-white shadow-lg shadow-violet-600/20 active:scale-95 transition-all duration-200"
        >
          <Plus size={18} />
          Tạo dự án mới
        </button>
      </div>

      {/* Grid Danh sách dự án */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-zinc-500">
          <Loader2 className="animate-spin text-violet-500 mb-3" size={32} />
          <p className="text-sm">Đang tải danh sách dự án...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex-1 border border-dashed border-zinc-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center max-w-xl mx-auto w-full my-10 bg-zinc-950/40">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-4">
            <ImageIcon size={24} />
          </div>
          <h3 className="text-lg font-bold text-zinc-200">Chưa có dự án nào</h3>
          <p className="text-zinc-500 text-sm mt-1 max-w-xs">
            Bắt đầu bằng cách tạo dự án mới để tải ảnh khung, sản phẩm và thiết kế mẫu banner.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-5 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-sm font-semibold transition-colors"
          >
            <Plus size={16} />
            Tạo dự án đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <a
              key={project.id}
              href={`/projects/${project.id}`}
              className="group block border border-zinc-800/80 bg-zinc-900/40 rounded-2xl p-6 hover:border-violet-500/50 hover:bg-zinc-900/80 transition-all duration-300 relative overflow-hidden"
            >
              {/* Hiệu ứng glow góc nền khi hover */}
              <div className="absolute -right-10 -top-10 w-24 h-24 rounded-full bg-violet-600/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-400 group-hover:bg-violet-950/30 group-hover:border-violet-800/40 group-hover:text-violet-400 transition-colors">
                  <FolderOpen size={20} />
                </div>
                
                <button
                  onClick={(e) => handleDelete(project.id, e)}
                  className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/20 active:scale-95 transition-all"
                  title="Xóa dự án"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <h2 className="font-bold text-lg text-zinc-200 group-hover:text-white transition-colors line-clamp-1">
                {project.name}
              </h2>
              
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-500 font-medium">
                <div>
                  <span className="block text-[10px] uppercase text-zinc-600 tracking-wider">Canvas size</span>
                  <span className="text-zinc-300 font-mono">{project.canvasWidth} x {project.canvasHeight} px</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-zinc-600 tracking-wider">Định dạng</span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/50 font-mono text-[10px] text-zinc-300">
                    {project.outputFormat}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
                <span>{new Date(project.createdAt).toLocaleDateString('vi-VN')}</span>
                <span className="flex items-center gap-1 text-violet-400 font-bold group-hover:translate-x-1 transition-transform">
                  Mở dự án
                  <ArrowRight size={14} />
                </span>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Modal Tạo dự án mới */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0e0e11] border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/40">
              <h2 className="text-lg font-bold">Tạo dự án thiết kế mới</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-sm font-semibold p-1 hover:bg-zinc-800 rounded"
              >
                Đóng
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              {/* Tên dự án */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase text-zinc-400 tracking-wider">Tên dự án</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Campaign Flash Sale 6/6"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-violet-500 focus:outline-none text-sm text-white placeholder-zinc-600 transition-colors"
                />
              </div>

              {/* Preset kích thước */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase text-zinc-400 tracking-wider">Kích thước Canvas</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePresetChange('shopee')}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      preset === 'shopee'
                        ? 'border-violet-500 bg-violet-600/10 text-violet-400'
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    Shopee (1:1)<span className="block text-[9px] text-zinc-500 mt-0.5">1200 x 1200 px</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetChange('tiktok')}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      preset === 'tiktok'
                        ? 'border-violet-500 bg-violet-600/10 text-violet-400'
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    TikTok Shop (1:1)<span className="block text-[9px] text-zinc-500 mt-0.5">1000 x 1000 px</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetChange('custom')}
                    className={`px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      preset === 'custom'
                        ? 'border-violet-500 bg-violet-600/10 text-violet-400'
                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    Tùy chỉnh<span className="block text-[9px] text-zinc-500 mt-0.5">Tùy biến kích cỡ</span>
                  </button>
                </div>
              </div>

              {/* Form nhập kích thước custom */}
              {preset === 'custom' && (
                <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-3 duration-250">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 font-medium">Chiều rộng (px)</label>
                    <input
                      type="number"
                      min={100}
                      max={4000}
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 font-medium">Chiều cao (px)</label>
                    <input
                      type="number"
                      min={100}
                      max={4000}
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Định dạng ảnh xuất */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase text-zinc-400 tracking-wider">Định dạng ảnh xuất</label>
                <div className="flex gap-4">
                  {['WEBP', 'JPEG', 'PNG'].map((fmt) => (
                    <label key={fmt} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        name="outputFormat"
                        value={fmt}
                        checked={format === fmt}
                        onChange={() => setFormat(fmt)}
                        className="accent-violet-500 w-4 h-4"
                      />
                      {fmt === 'WEBP' ? 'WebP (Tối ưu nhất)' : fmt === 'JPEG' ? 'JPEG (Độ nét cao)' : 'PNG (Nền trong suốt)'}
                    </label>
                  ))}
                </div>
              </div>

              {/* Cấu hình tên file chuẩn SEO */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase text-zinc-400 tracking-wider">Quy tắc đặt tên file SEO</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: {productSlug}-khung-shopee"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl focus:border-violet-500 focus:outline-none text-sm text-white transition-colors"
                />
                <p className="text-[10px] text-zinc-500 leading-normal">
                  Hỗ trợ các placeholder: <code className="text-violet-400">{`{productSlug}`}</code> (tên sản phẩm chuẩn SEO), <code className="text-violet-400">{`{brand}`}</code> (thương hiệu), <code className="text-violet-400">{`{category}`}</code>, <code className="text-violet-400">{`{color}`}</code>.
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-900 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 active:scale-95 transition-all"
                >
                  {creating && <Loader2 className="animate-spin" size={16} />}
                  Khởi tạo dự án
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
