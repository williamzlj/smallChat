import { useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn, ZoomOut } from 'lucide-react';

interface AvatarCropModalProps {
  onDone: (dataUrl: string) => void; // 输出 256x256 JPEG dataURL
  onClose: () => void;
  isDarkMode: boolean;
}

const VIEW = 280; // 预览视口边长
const OUT = 256; // 输出边长

// 头像裁剪：选图 → 拖动/缩放 → 输出 256x256 JPEG
export const AvatarCropModal = ({ onDone, onClose, isDarkMode }: AvatarCropModalProps) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  // 初始缩放：让图片盖住视口（cover）
  const [minScale, setMinScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const el = new Image();
      el.onload = () => {
        const s = Math.max(VIEW / el.width, VIEW / el.height);
        setImg(el);
        setMinScale(s);
        setScale(s);
        setOffset({ x: 0, y: 0 });
        setError('');
      };
      el.onerror = () => setError('图片读取失败');
      el.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    fileRef.current?.click();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 钳制偏移，保证裁剪区域始终在图片内
  const clamp = (x: number, y: number, s: number, el: HTMLImageElement) => {
    const w = el.width * s;
    const h = el.height * s;
    const maxX = Math.max(0, (w - VIEW) / 2);
    const maxY = Math.max(0, (h - VIEW) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!img || !dragRef.current) return;
    const d = dragRef.current;
    setOffset(clamp(d.baseX + e.clientX - d.startX, d.baseY + e.clientY - d.startY, scale, img));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const changeScale = (s: number) => {
    if (!img) return;
    const ns = Math.min(minScale * 4, Math.max(minScale, s));
    setScale(ns);
    setOffset((o) => clamp(o.x, o.y, ns, img));
  };

  const confirm = () => {
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    // willReadFrequently 强制软件渲染画布：安卓 Firefox 硬件加速画布裁剪大图会输出全黑
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, OUT, OUT);
    // 视口内图片绘制位置：中心 + offset；裁剪框即整个视口
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const drawX = (VIEW - drawW) / 2 + offset.x;
    const drawY = (VIEW - drawH) / 2 + offset.y;
    // 映射到输出尺寸
    const k = OUT / VIEW;
    ctx.drawImage(img, drawX * k, drawY * k, drawW * k, drawH * k);
    onDone(canvas.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-xl w-full max-w-sm ${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-800'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h3 className="font-bold">裁剪头像</h3>
          <button onClick={onClose} className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {!img ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-8 border-2 border-dashed rounded-xl text-sm text-gray-400 hover:border-green-500 hover:text-green-500 transition-colors"
            >
              点击选择图片
            </button>
          ) : (
            <>
              {/* 裁剪视口 */}
              <div
                className="relative overflow-hidden rounded-xl touch-none cursor-move bg-gray-900"
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="absolute max-w-none select-none"
                  style={{
                    width: img.width * scale,
                    height: img.height * scale,
                    left: (VIEW - img.width * scale) / 2 + offset.x,
                    top: (VIEW - img.height * scale) / 2 + offset.y,
                  }}
                />
                {/* 圆形裁剪参考线 */}
                <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.8)', borderRadius: '50%' }} />
              </div>
              {/* 缩放滑块 */}
              <div className="flex items-center space-x-2 w-full">
                <ZoomOut className="w-4 h-4 text-gray-400" />
                <input
                  type="range"
                  min={minScale}
                  max={minScale * 4}
                  step={0.01}
                  value={scale}
                  onChange={(e) => changeScale(parseFloat(e.target.value))}
                  className="flex-1 accent-green-500"
                />
                <ZoomIn className="w-4 h-4 text-gray-400" />
              </div>
            </>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="p-4 pt-0 flex space-x-2">
          <button
            onClick={() => fileRef.current?.click()}
            className={`flex-1 py-2 rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            重新选择
          </button>
          <button
            onClick={confirm}
            disabled={!img}
            className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 flex items-center justify-center space-x-1"
          >
            <Check className="w-4 h-4" />
            <span>确定</span>
          </button>
        </div>
      </div>
    </div>
  );
};
