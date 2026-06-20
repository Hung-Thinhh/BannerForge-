'use client';

import { useEffect, useRef, useState } from 'react';
import { 
  Type, Image as ImageIcon, Layers, MoveUp, MoveDown, Trash2, 
  Save, AlertCircle, RefreshCw, ZoomIn, ZoomOut, Check, Square,
  Maximize, Minimize, Undo, Redo, RotateCcw
} from 'lucide-react';

const ARTBOARD_PADDING = 300;

interface Asset {
  id: string;
  name: string;
  kind: string;
  path: string;
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
}

interface CanvasEditorProps {
  projectId: string;
  canvasWidth: number;
  canvasHeight: number;
  assets: Asset[];
  products: Product[];
  activeTemplate: any;
  onSaveTemplate: (schema: any) => Promise<void>;
  onChangeCanvasSize?: (width: number, height: number) => Promise<void>;
}

export default function CanvasEditor({
  projectId,
  canvasWidth,
  canvasHeight,
  assets,
  products,
  activeTemplate,
  onSaveTemplate,
  onChangeCanvasSize
}: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [fabricLib, setFabricLib] = useState<any>(null);
  const [canvas, setCanvas] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [artboardColor, setArtboardColor] = useState('#ffffff');

  const selectedProductRef = useRef(selectedProduct);
  const assetsRef = useRef(assets);
  const justSavedRef = useRef(false);

  // Lịch sử Canvas để hỗ trợ Undo/Redo/Reset
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isloadingStateRef = useRef(false);
  const historyRef = useRef<any[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const pushHistoryRef = useRef<() => void>(() => {});

  useEffect(() => {
    selectedProductRef.current = selectedProduct;
  }, [selectedProduct]);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  // 1. Tải thư viện Fabric.js trên Client-side và thiết lập cấu hình viền nổi bật
  useEffect(() => {
    import('fabric').then((module) => {
      const fb = module.fabric;
      
      // Định cấu hình mặc định cho tất cả các đối tượng Fabric cho rõ nét
      fb.Object.prototype.borderColor = '#4f46e5';     // Đường viền màu indigo đậm
      fb.Object.prototype.cornerColor = '#4f46e5';      // Các nút điều khiển ở góc màu indigo đậm
      fb.Object.prototype.cornerStrokeColor = '#312e81'; // Viền ngoài nút góc
      fb.Object.prototype.cornerSize = 12;               // Kích thước nút kéo góc
      fb.Object.prototype.transparentCorners = false;    // Nút góc đặc
      fb.Object.prototype.borderScaleFactor = 3;         // Độ dày đường viền chọn = 3px

      setFabricLib(fb);
    });
  }, []);

  // Thiết lập sản phẩm demo mặc định
  useEffect(() => {
    if (products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0]);
    }
  }, [products, selectedProduct]);

  // 2. Khởi tạo Fabric Canvas (chỉ chạy một lần khi fabricLib được nạp)
  useEffect(() => {
    if (!fabricLib || !canvasRef.current || !containerRef.current) return;

    // Tổng kích thước Fabric Canvas bao gồm Artboard + Padding 2 bên
    const totalWidth = canvasWidth + ARTBOARD_PADDING * 2;
    const totalHeight = canvasHeight + ARTBOARD_PADDING * 2;

    // Tính toán tỉ lệ zoom phù hợp ban đầu để vừa khung container
    const containerWidth = containerRef.current.clientWidth;
    const initialZoom = Math.min((containerWidth - 40) / totalWidth, 1);
    setZoom(initialZoom);

    const fCanvas = new fabricLib.Canvas(canvasRef.current, {
      width: totalWidth * initialZoom,
      height: totalHeight * initialZoom,
      backgroundColor: '#18181b', // Màu xám pasteboard của figma
      preserveObjectStacking: true,
    });

    // Thiết lập hệ số zoom cho canvas
    fCanvas.setZoom(initialZoom);

    // Lắng nghe sự kiện để cập nhật UI panel
    const handleSelection = () => {
      setSelectedObject(fCanvas.getActiveObject());
    };

    fCanvas.on('selection:created', handleSelection);
    fCanvas.on('selection:updated', handleSelection);
    fCanvas.on('selection:cleared', () => setSelectedObject(null));
    fCanvas.on('object:modified', () => {
      handleSelection();
      pushHistoryRef.current();
    });
    fCanvas.on('object:added', () => pushHistoryRef.current());
    fCanvas.on('object:removed', () => pushHistoryRef.current());

    setCanvas(fCanvas);

    return () => {
      fCanvas.dispose();
      setCanvas(null);
    };
  }, [fabricLib]);

  // Cập nhật kích thước canvas động khi thay đổi cấu hình dự án mà không dựng lại Canvas mới
  useEffect(() => {
    if (!canvas || !containerRef.current || !fabricLib) return;
    
    const totalWidth = canvasWidth + ARTBOARD_PADDING * 2;
    const totalHeight = canvasHeight + ARTBOARD_PADDING * 2;

    const containerWidth = containerRef.current.clientWidth;
    const newZoom = Math.min((containerWidth - 40) / totalWidth, 1);
    
    setZoom(newZoom);
    canvas.setZoom(newZoom);
    canvas.setWidth(totalWidth * newZoom);
    canvas.setHeight(totalHeight * newZoom);

    // Cập nhật kích thước Artboard Background Rect
    const artboardBg = canvas.getObjects().find((o: any) => o.id === 'artboard-background');
    if (artboardBg) {
      artboardBg.set({
        width: canvasWidth,
        height: canvasHeight
      });
    }

    // Cập nhật kích thước Artboard Background Image
    const artboardImg = canvas.getObjects().find((o: any) => o.id === 'artboard-image');
    if (artboardImg) {
      artboardImg.set({
        width: canvasWidth,
        height: canvasHeight
      });
    }

    canvas.renderAll();
  }, [canvas, canvasWidth, canvasHeight, fabricLib]);

  // 3. Nạp lại thiết kế cũ (Template) nếu có
  useEffect(() => {
    if (!canvas || !fabricLib) return;

    // Nếu vừa bấm Lưu thiết kế xong, canvas hiện tại đã hoàn hảo rồi, bỏ qua không cần nạp lại
    if (justSavedRef.current) {
      justSavedRef.current = false;
      return;
    }

    // Xóa trắng canvas trước
    canvas.clear();
    // Đặt màu nền cho Pasteboard bên ngoài
    canvas.setBackgroundColor('#18181b', canvas.renderAll.bind(canvas));

    // Tạo hình chữ nhật Artboard trắng/màu làm nền trung tâm
    const artboardBg = new fabricLib.Rect({
      left: ARTBOARD_PADDING,
      top: ARTBOARD_PADDING,
      width: canvasWidth,
      height: canvasHeight,
      fill: artboardColor,
      selectable: false,
      evented: false,
      id: 'artboard-background',
      shadow: new fabricLib.Shadow({
        color: 'rgba(0, 0, 0, 0.45)',
        blur: 24,
        offsetX: 0,
        offsetY: 8
      })
    });
    canvas.add(artboardBg);
    canvas.sendToBack(artboardBg);

    if (activeTemplate && activeTemplate.schema) {
      try {
        const schema = typeof activeTemplate.schema === 'string' 
          ? JSON.parse(activeTemplate.schema) 
          : activeTemplate.schema;
        
        // 1. Tải Background của Artboard trước để tránh đè lớp khác
        const loadBackground = new Promise<void>((resolveBg) => {
          if (schema.canvas?.background) {
            if (schema.canvas.background.startsWith('#')) {
              setArtboardColor(schema.canvas.background);
              artboardBg.set({ fill: schema.canvas.background });
              resolveBg();
            } else {
              // Nền là file ảnh
              fabricLib.Image.fromURL(schema.canvas.background, (img: any) => {
                img.set({
                  left: ARTBOARD_PADDING,
                  top: ARTBOARD_PADDING,
                  scaleX: canvasWidth / img.width,
                  scaleY: canvasHeight / img.height,
                  selectable: false,
                  evented: false,
                  id: 'artboard-image'
                });
                canvas.add(img);
                canvas.sendToBack(img);
                canvas.bringForward(img); // Xếp ngay trên artboard-background
                resolveBg();
              }, { crossOrigin: 'anonymous' });
            }
          } else {
            resolveBg();
          }
        });

        // 2. Chờ background tải xong rồi dựng các layers khác theo đúng Z-Index thứ tự lưu
        loadBackground.then(() => {
          const loadPromises = (schema.layers || []).map((layer: any, index: number) => {
            return new Promise<any>((resolve) => {
              if (layer.type === 'image-slot') {
                const slotGroup = createProductSlot(layer.x, layer.y, layer.width, layer.height, layer.fit || 'contain', true);
                resolve({ index, obj: slotGroup });
              } else if (layer.type === 'asset-image') {
                fabricLib.Image.fromURL(layer.src, (img: any) => {
                  const scaleX = layer.width / img.width;
                  const scaleY = layer.height / img.height;
                  img.set({
                    left: layer.x + ARTBOARD_PADDING,
                    top: layer.y + ARTBOARD_PADDING,
                    scaleX: scaleX,
                    scaleY: scaleY,
                    src: layer.src,
                    id: layer.id || `asset-${Date.now()}`
                  });

                  // Nếu là sticker/logo (không phải khung/nền), khóa kéo dẹt cạnh bên
                  const filename = layer.src.split('/').pop() || '';
                  const asset = assetsRef.current.find((a: any) => a.path.includes(filename) || layer.src.includes(a.path));
                  const isFrame = asset ? asset.kind === 'FRAME' : true;
                  const isBg = asset ? asset.kind === 'BACKGROUND' : false;
                  if (!isFrame && !isBg) {
                    img.setControlsVisibility({
                      mt: false,
                      mb: false,
                      ml: false,
                      mr: false
                    });
                  }
                  resolve({ index, obj: img });
                }, { crossOrigin: 'anonymous' });
              } else if (layer.type === 'text') {
                const textObj = addTextLayer(layer.bind, layer.fontSize, layer.color, layer.x, layer.y, layer.align, layer.fontWeight, layer.width, true);
                resolve({ index, obj: textObj });
              } else {
                resolve({ index, obj: null });
              }
            });
          });

          Promise.all(loadPromises).then((results) => {
            // Sắp xếp các layer đúng theo thứ tự mảng đã được lưu (Z-Index từ thấp đến cao)
            results.sort((a, b) => a.index - b.index);
            results.forEach((res) => {
              if (res.obj) {
                canvas.add(res.obj);
              }
            });

            // Tự động gán sản phẩm xem thử (nếu có) sau khi tải xong bố cục mẫu
            if (selectedProductRef.current) {
              updateProductSlotRatio();

              canvas.getObjects().forEach((obj: any) => {
                if (obj.type === 'textbox' && obj.bind) {
                  const key = obj.bind.replace('product.', '');
                  const val = selectedProductRef.current[key as keyof Product] || '';
                  obj.set({ text: String(val) });
                }
              });
            }

            canvas.renderAll();
            setTimeout(() => {
              pushHistoryRef.current();
            }, 100);
          });
        });
      } catch (err) {
        console.error('Failed to parse template schema:', err);
      }
    } else {
      // Nếu là dự án mới tinh, tự tạo sẵn 1 Product Slot ở giữa Artboard
      createProductSlot(canvasWidth * 0.1, canvasHeight * 0.1, canvasWidth * 0.8, canvasHeight * 0.8, 'contain');
      setTimeout(() => {
        pushHistoryRef.current();
      }, 100);
    }
  }, [canvas, activeTemplate, fabricLib]);

  // 4. Cập nhật dữ liệu Binding Demo lên Canvas
  useEffect(() => {
    if (!canvas || !selectedProduct || !fabricLib) return;

    // Cập nhật slot ảnh sản phẩm
    const existingSlot = canvas.getObjects().find((o: any) => o.id === 'product-slot');
    if (existingSlot) {
      updateProductSlotRatio();
    }

    // Cập nhật text động
    canvas.getObjects().forEach((obj: any) => {
      if (obj.type === 'textbox' && obj.bind) {
        const key = obj.bind.replace('product.', '');
        const val = selectedProduct[key as keyof Product] || '';
        obj.set({ text: String(val) });
      }
    });
    canvas.renderAll();
  }, [canvas, selectedProduct, fabricLib]);

  // 5. Các hàm phục vụ tính năng Undo / Redo / Reset của Canvas
  const getSerializedSchema = () => {
    if (!canvas) return null;
    const fabricObjects = canvas.getObjects();
    const layers = fabricObjects
      .filter((obj: any) => obj.id !== 'artboard-background' && obj.id !== 'artboard-image')
      .map((obj: any, index: number) => {
        const x = obj.left - ARTBOARD_PADDING;
        const y = obj.top - ARTBOARD_PADDING;
        const w = obj.width * obj.scaleX;
        const h = obj.height * obj.scaleY;

        const base: any = {
          id: obj.id || `layer-${index}`,
          x,
          y,
          width: w,
          height: h,
          zIndex: index,
        };

        if (obj.id === 'product-slot') {
          base.type = 'image-slot';
          base.bind = 'product.image';
          base.fit = obj.fit || 'contain';
        } else if (obj.src) {
          base.type = 'asset-image';
          base.src = obj.src;
        } else if (obj.type === 'textbox' || obj.type === 'text') {
          base.type = 'text';
          base.bind = obj.bind || null;
          base.fontFamily = obj.fontFamily || 'Be Vietnam Pro';
          base.fontSize = obj.fontSize;
          base.fontWeight = obj.fontWeight;
          base.color = obj.fill;
          base.align = obj.textAlign || 'left';
        }
        return base;
      });

    let background = artboardColor;
    const artboardImg = fabricObjects.find((obj: any) => obj.id === 'artboard-image');
    if (artboardImg && artboardImg.src) {
      background = artboardImg.src;
    }

    return {
      version: 1,
      canvas: {
        width: canvasWidth,
        height: canvasHeight,
        background
      },
      layers
    };
  };

  const loadCanvasFromSchema = async (schema: any) => {
    if (!canvas || !fabricLib) return;
    
    isloadingStateRef.current = true;

    // Xóa trắng canvas trước
    canvas.clear();
    canvas.setBackgroundColor('#18181b', canvas.renderAll.bind(canvas));

    // Tạo hình chữ nhật Artboard trắng/màu làm nền trung tâm
    const artboardBg = new fabricLib.Rect({
      left: ARTBOARD_PADDING,
      top: ARTBOARD_PADDING,
      width: canvasWidth,
      height: canvasHeight,
      fill: artboardColor,
      selectable: false,
      evented: false,
      id: 'artboard-background',
      shadow: new fabricLib.Shadow({
        color: 'rgba(0, 0, 0, 0.45)',
        blur: 24,
        offsetX: 0,
        offsetY: 8
      })
    });
    canvas.add(artboardBg);
    canvas.sendToBack(artboardBg);

    if (schema) {
      if (schema.canvas?.background) {
        if (schema.canvas.background.startsWith('#')) {
          setArtboardColor(schema.canvas.background);
          artboardBg.set({ fill: schema.canvas.background });
        } else {
          // Nền là file ảnh
          await new Promise<void>((resolve) => {
            fabricLib.Image.fromURL(schema.canvas.background, (img: any) => {
              img.set({
                left: ARTBOARD_PADDING,
                top: ARTBOARD_PADDING,
                scaleX: canvasWidth / img.width,
                scaleY: canvasHeight / img.height,
                selectable: false,
                evented: false,
                id: 'artboard-image'
              });
              canvas.add(img);
              canvas.sendToBack(img);
              canvas.bringForward(img);
              resolve();
            }, { crossOrigin: 'anonymous' });
          });
        }
      }

      const loadPromises = (schema.layers || []).map((layer: any, idx: number) => {
        return new Promise<any>((resolve) => {
          if (layer.type === 'image-slot') {
            const slotGroup = createProductSlot(layer.x, layer.y, layer.width, layer.height, layer.fit || 'contain', true);
            resolve({ index: idx, obj: slotGroup });
          } else if (layer.type === 'asset-image') {
            fabricLib.Image.fromURL(layer.src, (img: any) => {
              const scaleX = layer.width / img.width;
              const scaleY = layer.height / img.height;
              img.set({
                left: layer.x + ARTBOARD_PADDING,
                top: layer.y + ARTBOARD_PADDING,
                scaleX: scaleX,
                scaleY: scaleY,
                src: layer.src,
                id: layer.id || `asset-${Date.now()}`
              });

              const filename = layer.src.split('/').pop() || '';
              const asset = assetsRef.current.find((a: any) => a.path.includes(filename) || layer.src.includes(a.path));
              const isFrame = asset ? asset.kind === 'FRAME' : true;
              const isBg = asset ? asset.kind === 'BACKGROUND' : false;
              if (!isFrame && !isBg) {
                img.setControlsVisibility({
                  mt: false,
                  mb: false,
                  ml: false,
                  mr: false
                });
              }
              resolve({ index: idx, obj: img });
            }, { crossOrigin: 'anonymous' });
          } else if (layer.type === 'text') {
            const textObj = addTextLayer(layer.bind, layer.fontSize, layer.color, layer.x, layer.y, layer.align, layer.fontWeight, layer.width, true);
            resolve({ index: idx, obj: textObj });
          } else {
            resolve({ index: idx, obj: null });
          }
        });
      });

      const results = await Promise.all(loadPromises);
      results.sort((a, b) => a.index - b.index);
      results.forEach((res) => {
        if (res.obj) canvas.add(res.obj);
      });

      if (selectedProductRef.current) {
        updateProductSlotRatio();
        canvas.getObjects().forEach((obj: any) => {
          if (obj.type === 'textbox' && obj.bind) {
            const key = obj.bind.replace('product.', '');
            const val = selectedProductRef.current[key as keyof Product] || '';
            obj.set({ text: String(val) });
          }
        });
      }
    }
    
    canvas.renderAll();
    isloadingStateRef.current = false;
  };

  const pushHistory = () => {
    if (isloadingStateRef.current) return;
    const schema = getSerializedSchema();
    if (!schema) return;

    const currentHist = historyRef.current.slice(0, historyIndexRef.current + 1);
    
    const lastState = currentHist[currentHist.length - 1];
    if (lastState && JSON.stringify(lastState) === JSON.stringify(schema)) {
      return;
    }

    const nextHist = [...currentHist, schema];
    historyRef.current = nextHist;
    historyIndexRef.current = nextHist.length - 1;
    
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  };

  pushHistoryRef.current = pushHistory;

  const handleUndo = async () => {
    if (historyIndexRef.current > 0) {
      const nextIdx = historyIndexRef.current - 1;
      historyIndexRef.current = nextIdx;
      const schema = historyRef.current[nextIdx];
      await loadCanvasFromSchema(schema);
      setCanUndo(nextIdx > 0);
      setCanRedo(true);
    }
  };

  const handleRedo = async () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      const nextIdx = historyIndexRef.current + 1;
      historyIndexRef.current = nextIdx;
      const schema = historyRef.current[nextIdx];
      await loadCanvasFromSchema(schema);
      setCanUndo(true);
      setCanRedo(nextIdx < historyRef.current.length - 1);
    }
  };

  const handleReset = async () => {
    if (historyRef.current.length > 0) {
      historyIndexRef.current = 0;
      const schema = historyRef.current[0];
      await loadCanvasFromSchema(schema);
      setCanUndo(false);
      setCanRedo(historyRef.current.length > 1);
    }
  };

  // Điều khiển Zoom canvas thủ công
  const handleZoom = (factor: number) => {
    if (!canvas) return;
    const newZoom = Math.max(0.1, Math.min(3, zoom + factor));
    setZoom(newZoom);
    canvas.setZoom(newZoom);
    canvas.setWidth((canvasWidth + ARTBOARD_PADDING * 2) * newZoom);
    canvas.setHeight((canvasHeight + ARTBOARD_PADDING * 2) * newZoom);
    canvas.renderAll();
  };

  // TẠO LỚP: Khung chứa ảnh sản phẩm (Product Slot)
  const createProductSlot = (x = 100, y = 100, w = 600, h = 600, fit = 'contain', returnObject = false): any => {
    if (!canvas || !fabricLib) return;

    // Xóa slot cũ nếu có (chỉ cho phép 1 slot sản phẩm duy nhất)
    const existing = canvas.getObjects().find((o: any) => o.id === 'product-slot');
    let oldIndex = -1;
    if (existing && !returnObject) {
      oldIndex = canvas.getObjects().indexOf(existing);
      canvas.remove(existing);
    }

    // Tạo một Rect làm viền đứt màu tím đậm
    const rect = new fabricLib.Rect({
      left: 0,
      top: 0,
      width: w,
      height: h,
      fill: 'rgba(99, 102, 241, 0.03)',
      stroke: '#4f46e5', // Viền tím/indigo đậm nổi bật hơn
      strokeWidth: 4,     // Tăng độ dày viền
      strokeDashArray: [10, 5],
      rx: 8,
      ry: 8,
      originX: 'center',
      originY: 'center',
    });

    const label = new fabricLib.Text('KHUNG ẢNH SẢN PHẨM\n(Tự động thay thế khi xuất)', {
      left: 0,
      top: 0,
      fontSize: 22,
      fontFamily: 'Outfit',
      fontWeight: 'bold',
      fill: '#818cf8',
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
    });

    // Tạo một Group để người dùng di chuyển/scale nguyên khối
    const group = new fabricLib.Group([rect, label], {
      left: x + ARTBOARD_PADDING,
      top: y + ARTBOARD_PADDING,
      width: w,
      height: h,
      id: 'product-slot',
      fit: fit,
      lockRotation: true,
    });

    // Khóa các hướng dẹt (Side Handles) để bắt buộc scale đồng dạng (giữ nguyên tỷ lệ 1:1)
    group.setControlsVisibility({
      mt: false, // middle top
      mb: false, // middle bottom
      ml: false, // middle left
      mr: false, // middle right
    });

    group.setPattern = function(img: any) {
      // Xóa tất cả các vật thể con trong group trừ rect viền đầu tiên
      const items = [...this.getObjects()];
      for (let i = 1; i < items.length; i++) {
        this.remove(items[i]);
      }
      
      const currentFit = this.fit || 'contain';
      const scaleX = this.width / img.width;
      const scaleY = this.height / img.height;
      const scale = currentFit === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);
      
      img.set({
        originX: 'center',
        originY: 'center',
        left: 0, // Tọa độ tương đối so với tâm group
        top: 0,
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false
      });
      
      this.add(img);
      this.setCoords();
    };

    if (returnObject) {
      return group;
    }

    if (oldIndex !== -1) {
      canvas.insertAt(group, oldIndex);
    } else {
      canvas.add(group);
      canvas.sendToBack(group);
    }
  };

  // Helper: Cập nhật slot ảnh sản phẩm đồng thời điều chỉnh tỷ lệ khung viền
  const updateProductSlotRatio = () => {
    if (!canvas || !fabricLib) return;
    const existing = canvas.getObjects().find((o: any) => o.id === 'product-slot');
    if (!existing) return;

    const x = existing.left - ARTBOARD_PADDING;
    const y = existing.top - ARTBOARD_PADDING;
    const currentW = existing.width * existing.scaleX;
    const currentH = existing.height * existing.scaleY;

    // Kiểm tra xem slot có đang được chọn trên Canvas hay không trước khi vẽ lại
    const activeObj = canvas.getActiveObject();
    const isSelected = activeObj && activeObj.id === 'product-slot';

    if (selectedProduct) {
      fabricLib.Image.fromURL(selectedProduct.imagePath, (img: any) => {
        const imgRatio = img.width / img.height;
        const newW = currentW;
        const newH = newW / imgRatio; // Luôn luôn co giãn theo tỷ lệ ảnh sản phẩm gốc

        createProductSlot(x, y, newW, newH, 'contain');

        const newSlot = canvas.getObjects().find((o: any) => o.id === 'product-slot');
        if (newSlot) {
          newSlot.setPattern(img);
          
          // Khôi phục lại trạng thái focus nếu trước đó đang chọn
          if (isSelected) {
            canvas.setActiveObject(newSlot);
            setSelectedObject(newSlot);
          }
        }
        canvas.renderAll();
      });
    } else {
      createProductSlot(x, y, currentW, currentH, 'contain');
      const newSlot = canvas.getObjects().find((o: any) => o.id === 'product-slot');
      if (newSlot && isSelected) {
        canvas.setActiveObject(newSlot);
        setSelectedObject(newSlot);
      }
      canvas.renderAll();
    }
  };

  // TẠO LỚP: Thêm ảnh tĩnh Asset (Khung đè, Logo...)
  const addAssetToCanvas = (src: string, x = 0, y = 0, w = canvasWidth, h = canvasHeight) => {
    if (!canvas || !fabricLib) return;

    fabricLib.Image.fromURL(src, async (img: any) => {
      // Nhận diện loại asset để có thuật toán scale ban đầu phù hợp
      const filename = src.split('/').pop() || '';
      const asset = assets.find(a => a.path.includes(filename) || src.includes(a.path));
      const isFrame = asset ? asset.kind === 'FRAME' : true;
      const isBg = asset ? asset.kind === 'BACKGROUND' : false;

      let targetW = w;
      let targetH = h;

      // Tự động điều chỉnh kích thước Canvas khớp với kích thước ảnh khung/nền
      if ((isFrame || isBg) && onChangeCanvasSize) {
        const imgW = img.width || canvasWidth;
        const imgH = img.height || canvasHeight;
        if (imgW !== canvasWidth || imgH !== canvasHeight) {
          await onChangeCanvasSize(imgW, imgH);
          targetW = imgW;
          targetH = imgH;
        }
      }

      let scaleX = targetW / img.width;
      let scaleY = targetH / img.height;

      if (!isFrame && !isBg) {
        // Nếu là Sticker/Logo: Giữ nguyên tỷ lệ gốc, thu nhỏ lại tối đa 250px
        const maxSize = 250;
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        scaleX = scale;
        scaleY = scale;
        // Đặt ở vị trí chính giữa
        x = (canvasWidth - img.width * scale) / 2;
        y = (canvasHeight - img.height * scale) / 2;
      }

      img.set({
        left: x + ARTBOARD_PADDING,
        top: y + ARTBOARD_PADDING,
        scaleX: scaleX,
        scaleY: scaleY,
        src: src,
        id: `asset-${Date.now()}`
      });

      // Đối với logo và sticker, ẩn các nút kéo dẹt cạnh bên để bảo toàn tỷ lệ gốc khi scale
      if (!isFrame && !isBg) {
        img.setControlsVisibility({
          mt: false,
          mb: false,
          ml: false,
          mr: false
        });
      }

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
    });
  };

  // TẠO LỚP: Thêm Chữ Động (Text Layer)
  const addTextLayer = (
    bindKey: string, 
    fontSize = 44, 
    color = '#111111', 
    x = 100, 
    y = 100, 
    align = 'center',
    fontWeight = 'bold',
    w?: number,
    returnObject = false
  ): any => {
    if (!canvas || !fabricLib) return;

    let defaultText = 'Mẫu chữ';
    if (selectedProduct) {
      const key = bindKey.replace('product.', '');
      defaultText = String(selectedProduct[key as keyof Product] || defaultText);
    }

    const textbox = new fabricLib.Textbox(defaultText, {
      left: x + ARTBOARD_PADDING,
      top: y + ARTBOARD_PADDING,
      width: w || canvasWidth * 0.8,
      fontSize: fontSize,
      fontFamily: 'Be Vietnam Pro',
      fontWeight: fontWeight,
      fill: color,
      textAlign: align,
      bind: bindKey, // Gắn biến động (ví dụ product.name)
      id: `text-${Date.now()}`,
      borderColor: '#818cf8',
      cornerColor: '#6366f1',
      cornerSize: 10,
      transparentCorners: false
    });

    if (returnObject) {
      return textbox;
    }

    canvas.add(textbox);
    canvas.setActiveObject(textbox);
    canvas.renderAll();
  };

  // THAO TÁC LAYER: Di chuyển thứ tự lớp
  const moveLayer = (direction: 'up' | 'down') => {
    if (!canvas || !selectedObject) return;
    
    const objects = canvas.getObjects();
    const artboardBg = objects.find((o: any) => o.id === 'artboard-background');
    const artboardImg = objects.find((o: any) => o.id === 'artboard-image');
    
    const minIndex = Math.max(
      artboardBg ? objects.indexOf(artboardBg) : -1,
      artboardImg ? objects.indexOf(artboardImg) : -1
    ) + 1;
    
    const currentIndex = objects.indexOf(selectedObject);
    
    if (direction === 'up') {
      canvas.bringForward(selectedObject);
    } else {
      if (currentIndex > minIndex) {
        canvas.sendBackwards(selectedObject);
      }
    }
    canvas.renderAll();
  };

  // THAO TÁC LAYER: Xóa đối tượng đang chọn
  const deleteSelected = () => {
    if (!canvas || !selectedObject) return;
    if (selectedObject.id === 'product-slot') {
      alert('Không thể xóa khung ảnh sản phẩm chính!');
      return;
    }
    canvas.remove(selectedObject);
    setSelectedObject(null);
    canvas.renderAll();
  };

  // THAO TÁC EDITOR: Lưu Template JSON lên server
  const saveTemplate = async () => {
    if (!canvas) return;
    setSaving(true);
    setErrorMessage('');

    try {
      // 1. Kiểm tra bắt buộc phải có Product Slot
      const pSlot = canvas.getObjects().find((o: any) => o.id === 'product-slot');
      if (!pSlot) {
        throw new Error('Mẫu thiết kế phải có ít nhất 1 Khung ảnh sản phẩm!');
      }

      // 2. Chuyển đổi Fabric objects sang Schema đơn giản cho Backend Sharp
      const fabricObjects = canvas.getObjects();
      
      const layers = fabricObjects
        .filter((obj: any) => obj.id !== 'artboard-background' && obj.id !== 'artboard-image')
        .map((obj: any, index: number) => {
          // Tọa độ và kích thước tuyệt đối (loại bỏ zoom của canvas và padding của artboard)
          const x = obj.left - ARTBOARD_PADDING;
          const y = obj.top - ARTBOARD_PADDING;
          // Chiều rộng thật bao gồm scale
          const w = obj.width * obj.scaleX;
          const h = obj.height * obj.scaleY;

          const base: any = {
            id: obj.id || `layer-${index}`,
            x,
            y,
            width: w,
            height: h,
            zIndex: index,
          };

          if (obj.id === 'product-slot') {
            base.type = 'image-slot';
            base.bind = 'product.image';
            base.fit = obj.fit || 'contain';
          } else if (obj.src) {
            base.type = 'asset-image';
            base.src = obj.src;
          } else if (obj.type === 'textbox' || obj.type === 'text') {
            base.type = 'text';
            base.bind = obj.bind || null;
            base.fontFamily = obj.fontFamily || 'Be Vietnam Pro';
            base.fontSize = obj.fontSize;
            base.fontWeight = obj.fontWeight;
            base.color = obj.fill;
            base.align = obj.textAlign || 'left';
          }
          
          return base;
        });

      // Lấy màu nền hoặc ảnh nền của Artboard
      let background = artboardColor;
      const artboardImg = fabricObjects.find((obj: any) => obj.id === 'artboard-image');
      if (artboardImg && artboardImg.src) {
        background = artboardImg.src;
      }

      const templateSchema = {
        version: 1,
        canvas: {
          width: canvasWidth,
          height: canvasHeight,
          background
        },
        layers
      };

      justSavedRef.current = true;
      await onSaveTemplate(templateSchema);
    } catch (err: any) {
      justSavedRef.current = false;
      setErrorMessage(err.message || 'Lỗi khi lưu thiết kế.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[680px]">
      
      {/* CỘT 1: Toolbars và Assets */}
      <div className="lg:col-span-1 flex flex-col gap-5 border border-zinc-800 bg-zinc-950/30 rounded-2xl p-5">
        
        {/* Nút thêm Layer */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
            <Layers size={14} className="text-violet-400" />
            Thêm thành phần
          </h3>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => addTextLayer('product.name', 44, '#ffffff', canvasWidth * 0.1, canvasHeight * 0.8, 'center')}
              className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-300 transition-colors"
            >
              <Type size={14} className="text-blue-400" />
              Tên sản phẩm
            </button>
            
            <button
              onClick={() => addTextLayer('product.price', 50, '#ffed4a', canvasWidth * 0.1, canvasHeight * 0.7, 'left')}
              className="flex items-center gap-2 p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-300 transition-colors"
            >
              <Type size={14} className="text-yellow-400" />
              Giá bán
            </button>
          </div>
        </div>

        {/* Uploaded Frames / Badges */}
        <div className="flex-1 flex flex-col min-h-[220px]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
            <ImageIcon size={14} className="text-violet-400" />
            Khung viền & Asset ({assets.length})
          </h3>
          
          {assets.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-xl p-6 text-center bg-zinc-950/50">
              <ImageIcon size={20} className="text-zinc-700 mb-2" />
              <p className="text-[10px] text-zinc-500 max-w-[120px]">Tải khung viền/sticker ở Tab "Asset" trước.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 pr-1 max-h-[300px]">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => addAssetToCanvas(asset.path)}
                  className="group relative border border-zinc-800/80 bg-zinc-900/30 hover:border-violet-500 rounded-xl p-2 flex flex-col items-center justify-center text-center transition-all overflow-hidden"
                >
                  <img 
                    src={asset.path} 
                    alt={asset.name}
                    className="max-h-16 max-w-full object-contain mb-1 rounded group-hover:scale-105 transition-transform" 
                  />
                  <span className="text-[9px] text-zinc-500 truncate w-full px-1">{asset.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Demo Binding Product Selector */}
        <div className="border-t border-zinc-900 pt-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Xem thử với sản phẩm</label>
          {products.length === 0 ? (
            <span className="text-xs text-zinc-600 block italic">Tải lên danh sách ảnh sản phẩm ở Tab "Sản phẩm".</span>
          ) : (
            <select
              value={selectedProduct?.id || ''}
              onChange={(e) => {
                const found = products.find(p => p.id === e.target.value);
                if (found) setSelectedProduct(found);
              }}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-violet-500"
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* CỘT 2 & 3: Canvas Workspace */}
      <div className="lg:col-span-2 flex flex-col items-center border border-zinc-800 bg-zinc-950/10 rounded-2xl p-6 relative overflow-hidden">
        
        {/* Thanh zoom & công cụ nhanh */}
        <div className="w-full flex items-center justify-between mb-4 border-b border-zinc-900 pb-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleZoom(-0.1)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
              title="Thu nhỏ"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs font-mono text-zinc-500 px-2 min-w-[48px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => handleZoom(0.1)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
              title="Phóng to"
            >
              <ZoomIn size={16} />
            </button>
            
            <span className="text-zinc-800 mx-2">|</span>
            
            <button
              onClick={() => {
                if (!canvas) return;
                const containerWidth = containerRef.current?.clientWidth || 500;
                const totalWidth = canvasWidth + ARTBOARD_PADDING * 2;
                const totalHeight = canvasHeight + ARTBOARD_PADDING * 2;
                const initialZoom = Math.min((containerWidth - 40) / totalWidth, 1);
                setZoom(initialZoom);
                canvas.setZoom(initialZoom);
                canvas.setWidth(totalWidth * initialZoom);
                canvas.setHeight(totalHeight * initialZoom);
                canvas.renderAll();
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 text-xs transition-colors"
              title="Vừa màn hình"
            >
              <Maximize size={12} />
              Fit Screen
            </button>

            <span className="text-zinc-800 mx-2">|</span>

            {/* Undo */}
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 disabled:opacity-20 disabled:hover:text-zinc-500 disabled:hover:bg-transparent transition-colors"
              title="Hoàn tác (Undo)"
            >
              <Undo size={15} />
            </button>

            {/* Redo */}
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 disabled:opacity-20 disabled:hover:text-zinc-500 disabled:hover:bg-transparent transition-colors"
              title="Làm lại (Redo)"
            >
              <Redo size={15} />
            </button>

            <span className="text-zinc-800 mx-2">|</span>

            {/* Reset */}
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 text-xs transition-colors"
              title="Khôi phục thiết kế ban đầu"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          </div>

          <div className="flex items-center gap-2">
            {errorMessage && (
              <div className="flex items-center gap-1 text-red-400 text-xs mr-2">
                <AlertCircle size={14} />
                <span>{errorMessage}</span>
              </div>
            )}
            <button
              onClick={saveTemplate}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-bold text-white shadow-lg shadow-violet-600/10 active:scale-95 transition-all"
            >
              {saving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
              Lưu thiết kế
            </button>
          </div>
        </div>

        {/* Vùng Canvas hiển thị */}
        <div ref={containerRef} className="w-full flex-1 flex items-center justify-center overflow-auto min-h-[480px]">
          <div className="border-4 border-zinc-900 rounded-2xl bg-zinc-950 relative overflow-hidden">
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>

      {/* CỘT 4: Panel Thuộc tính Layer đang chọn */}
      <div className="lg:col-span-1 flex flex-col gap-5 border border-zinc-800 bg-zinc-950/30 rounded-2xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-900 pb-3 flex items-center gap-1.5">
          <Layers size={14} className="text-violet-400" />
          Thuộc tính lớp
        </h3>

        {!selectedObject ? (
          <div className="space-y-5 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <span className="text-[10px] uppercase text-zinc-500 font-semibold tracking-wider block mb-1">Cấu hình thiết kế</span>
                <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-850 text-xs font-mono text-zinc-300">
                  Thuộc tính Artboard
                </span>
              </div>

              {/* Màu nền Canvas */}
              <div className="space-y-1.5 border-t border-zinc-900 pt-4">
                <label className="text-[11px] text-zinc-400 font-medium">Màu nền Artboard (Nền ảnh)</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={artboardColor}
                    onChange={(e) => {
                      const newColor = e.target.value;
                      setArtboardColor(newColor);
                      const artboardBg = canvas?.getObjects().find((o: any) => o.id === 'artboard-background');
                      if (artboardBg) {
                        artboardBg.set({ fill: newColor });
                        canvas?.renderAll();
                      }
                    }}
                    className="w-10 h-8 rounded border border-zinc-850 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={artboardColor}
                    onChange={(e) => {
                      const newColor = e.target.value;
                      setArtboardColor(newColor);
                      const artboardBg = canvas?.getObjects().find((o: any) => o.id === 'artboard-background');
                      if (artboardBg) {
                        artboardBg.set({ fill: newColor });
                        canvas?.renderAll();
                      }
                    }}
                    className="flex-1 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs uppercase font-mono text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
            </div>
            
            <div className="text-center text-[10px] text-zinc-500 border-t border-zinc-900 pt-4 leading-normal">
              Bấm chọn một thành phần (chữ, logo, sản phẩm) trên Canvas để tùy chỉnh thuộc tính riêng.
            </div>
          </div>
        ) : (
          <div className="space-y-5 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Loại lớp */}
              <div>
                <span className="text-[10px] uppercase text-zinc-500 font-semibold tracking-wider block mb-1">Loại thành phần</span>
                <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-850 text-xs font-mono text-zinc-300">
                  {selectedObject.id === 'product-slot' 
                    ? 'Slot Ảnh Sản Phẩm' 
                    : selectedObject.type === 'textbox' 
                    ? `Chữ Động (${selectedObject.bind || 'Tùy chỉnh'})` 
                    : 'Ảnh / Sticker / Khung'}
                </span>
              </div>

              {/* Điều khiển thứ tự lớp & xóa nhanh */}
              <div className="space-y-2 border-y border-zinc-900 py-3.5">
                <div className="flex gap-2">
                  <button
                    onClick={() => moveLayer('up')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 transition-colors"
                  >
                    <MoveUp size={12} />
                    Lên trên
                  </button>
                  
                  <button
                    onClick={() => moveLayer('down')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 transition-colors"
                  >
                    <MoveDown size={12} />
                    Xuống dưới
                  </button>
                </div>

                {selectedObject.id !== 'product-slot' && (
                  <button
                    onClick={deleteSelected}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-950/20 hover:bg-red-900 border border-red-900/40 text-xs font-semibold text-red-400 hover:text-white transition-colors"
                  >
                    <Trash2 size={12} />
                    Xóa khỏi Canvas
                  </button>
                )}
              </div>



              {/* Tùy chỉnh cho Lớp Ảnh / Sticker / Khung / Group */}
              {(selectedObject.type === 'image' || selectedObject.id === 'product-slot') && (
                <div className="space-y-4">
                  {/* Opacity (Không hiển thị cho product-slot) */}
                  {selectedObject.id !== 'product-slot' && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-zinc-400 font-medium">
                        <span>Độ mờ (Opacity)</span>
                        <span>{Math.round((selectedObject.opacity ?? 1) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round((selectedObject.opacity ?? 1) * 100)}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) / 100;
                          selectedObject.set({ opacity: val });
                          canvas.renderAll();
                          setSelectedObject(canvas.getActiveObject());
                        }}
                        onMouseUp={() => pushHistory()}
                        className="w-full accent-violet-500"
                      />
                    </div>
                  )}

                  {/* Kích thước */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-500 font-medium">Rộng (px)</label>
                      <input
                        type="number"
                        value={Math.round(selectedObject.width * selectedObject.scaleX)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val > 0) {
                            selectedObject.set({ scaleX: val / selectedObject.width });
                            canvas.renderAll();
                            setSelectedObject(canvas.getActiveObject());
                          }
                        }}
                        onBlur={() => pushHistory()}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-500 font-medium">Cao (px)</label>
                      <input
                        type="number"
                        value={Math.round(selectedObject.height * selectedObject.scaleY)}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val > 0) {
                            selectedObject.set({ scaleY: val / selectedObject.height });
                            canvas.renderAll();
                            setSelectedObject(canvas.getActiveObject());
                          }
                        }}
                        onBlur={() => pushHistory()}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Tọa độ */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-500 font-medium">Vị trí X (Trái)</label>
                      <input
                        type="number"
                        value={Math.round(selectedObject.left - ARTBOARD_PADDING)}
                        onChange={(e) => {
                          selectedObject.set({ left: Number(e.target.value) + ARTBOARD_PADDING });
                          canvas.renderAll();
                          setSelectedObject(canvas.getActiveObject());
                        }}
                        onBlur={() => pushHistory()}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-zinc-500 font-medium">Vị trí Y (Trên)</label>
                      <input
                        type="number"
                        value={Math.round(selectedObject.top - ARTBOARD_PADDING)}
                        onChange={(e) => {
                          selectedObject.set({ top: Number(e.target.value) + ARTBOARD_PADDING });
                          canvas.renderAll();
                          setSelectedObject(canvas.getActiveObject());
                        }}
                        onBlur={() => pushHistory()}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Nút căn chỉnh nhanh */}
                  <div className="space-y-2 border-t border-zinc-900 pt-3">
                    <label className="block text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Căn chỉnh nhanh</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          canvas.centerObject(selectedObject);
                          selectedObject.setCoords();
                          canvas.renderAll();
                          setSelectedObject(canvas.getActiveObject());
                        }}
                        className="py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-[11px] font-semibold text-zinc-300 transition-colors"
                      >
                        Căn giữa Canvas
                      </button>
                      <button
                        onClick={() => {
                          selectedObject.set({
                            left: ARTBOARD_PADDING,
                            top: ARTBOARD_PADDING,
                            scaleX: canvasWidth / selectedObject.width,
                            scaleY: canvasHeight / selectedObject.height
                          });
                          selectedObject.setCoords();
                          canvas.renderAll();
                          setSelectedObject(canvas.getActiveObject());
                          pushHistory();
                        }}
                        className="py-2 bg-violet-950/20 hover:bg-violet-900 border border-violet-900/40 rounded-xl text-[11px] font-semibold text-violet-400 hover:text-white transition-colors"
                      >
                        Căn tràn viền
                      </button>
                      <button
                        onClick={() => {
                          if (selectedObject.id === 'product-slot') {
                            const x = canvasWidth * 0.1;
                            const y = canvasHeight * 0.1;
                            const w = canvasWidth * 0.8;
                            const h = canvasHeight * 0.8;
                            
                            selectedObject.set({
                              left: x + ARTBOARD_PADDING,
                              top: y + ARTBOARD_PADDING,
                              scaleX: 1,
                              scaleY: 1,
                              angle: 0
                            });
                            
                            if (selectedProduct) {
                              fabricLib.Image.fromURL(selectedProduct.imagePath, (img: any) => {
                                const imgRatio = img.width / img.height;
                                selectedObject.set({
                                  width: w,
                                  height: w / imgRatio
                                });
                                selectedObject.setPattern(img);
                                canvas.renderAll();
                              });
                            } else {
                              selectedObject.set({
                                width: w,
                                height: h
                              });
                            }
                          } else {
                            selectedObject.set({
                              scaleX: 1,
                              scaleY: 1,
                              angle: 0
                            });
                            canvas.centerObject(selectedObject);
                          }
                          selectedObject.setCoords();
                          canvas.renderAll();
                          setSelectedObject(canvas.getActiveObject());
                          pushHistory();
                        }}
                        className="col-span-2 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-[11px] font-semibold text-zinc-350 hover:text-white transition-colors mt-1"
                      >
                        Khôi phục gốc (Reset)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tùy chỉnh cho Lớp Text */}
              {selectedObject.type === 'textbox' && (
                <div className="space-y-4">
                  {/* Nội dung text nếu không phải binding */}
                  {!selectedObject.bind && (
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-zinc-400 font-medium">Nội dung chữ</label>
                      <textarea
                        value={selectedObject.text}
                        onChange={(e) => {
                          selectedObject.set({ text: e.target.value });
                          canvas.renderAll();
                        }}
                        onBlur={() => pushHistory()}
                        className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                        rows={2}
                      />
                    </div>
                  )}

                  {/* Kích thước font */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 font-medium">Cỡ chữ (px): {selectedObject.fontSize}</label>
                    <input
                      type="range"
                      min={10}
                      max={200}
                      value={selectedObject.fontSize}
                      onChange={(e) => {
                        selectedObject.set({ fontSize: parseInt(e.target.value) });
                        canvas.renderAll();
                        // Trình kích hoạt re-render UI state
                        setSelectedObject(canvas.getActiveObject());
                      }}
                      onMouseUp={() => pushHistory()}
                      className="w-full accent-violet-500"
                    />
                  </div>

                  {/* Màu sắc */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 font-medium">Màu chữ</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={selectedObject.fill}
                        onChange={(e) => {
                          selectedObject.set({ fill: e.target.value });
                          canvas.renderAll();
                        }}
                        onBlur={() => pushHistory()}
                        className="w-10 h-8 rounded border border-zinc-800 bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={selectedObject.fill}
                        onChange={(e) => {
                          selectedObject.set({ fill: e.target.value });
                          canvas.renderAll();
                        }}
                        onBlur={() => pushHistory()}
                        className="flex-1 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs uppercase font-mono"
                      />
                    </div>
                  </div>

                  {/* Căn lề */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 font-medium">Căn lề</label>
                    <div className="grid grid-cols-3 gap-1">
                      {['left', 'center', 'right'].map((align) => (
                        <button
                          key={align}
                          onClick={() => {
                            selectedObject.set({ textAlign: align });
                            canvas.renderAll();
                            setSelectedObject(canvas.getActiveObject());
                            pushHistory();
                          }}
                          className={`py-1 rounded text-xs capitalize ${
                            selectedObject.textAlign === align 
                              ? 'bg-zinc-800 text-white font-bold' 
                              : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {align}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Độ đậm nhạt */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 font-medium">Độ đậm nhạt</label>
                    <div className="grid grid-cols-2 gap-1">
                      {['normal', 'bold'].map((weight) => (
                        <button
                          key={weight}
                          onClick={() => {
                            selectedObject.set({ fontWeight: weight });
                            canvas.renderAll();
                            setSelectedObject(canvas.getActiveObject());
                            pushHistory();
                          }}
                          className={`py-1 rounded text-xs capitalize ${
                            selectedObject.fontWeight === weight 
                              ? 'bg-zinc-800 text-white font-bold' 
                              : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          {weight}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>


          </div>
        )}
      </div>
      
    </div>
  );
}
