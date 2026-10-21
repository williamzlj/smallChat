import { useEffect, useRef, useState } from 'react';
import { X, Check, RotateCcw } from 'lucide-react';
import { IMAGE_MAX_WIDTH } from '../config';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  src: string; // 待裁剪图片的 object URL
  filename: string; // 原文件名（决定输出格式与命名）
  isDarkMode: boolean;
  onDone: (blob: Blob, filename: string) => void;
  onClose: () => void;
}

const MIN_SIZE = 24; // 选区最小边长（预览像素）

// 普通图片自由裁剪：拖动选区/四角缩放，输出原图对应区域的真实像素
export const ImageCropModal = ({ src, filename, isDarkMode, onDone, onClose }: Props) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 }); // 原图尺寸
  const [stage, setStage] = useState({ w: 0, h: 0 }); // 预览显示尺寸
  const [sel, setSel] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [error, setError] = useState('');
  const dragRef = useRef<{ mode: string; sx: number; sy: number; sel: Rect } | null>(null);

  useEffect(() => {
    const el = new Image();
    el.onload = () => {
      // 预览区：适配视口，小图不放大
      const maxW = Math.min(window.innerWidth - 64, 640);
      const maxH = Math.min(window.innerHeight * 0.55, 460);
      const k = Math.min(maxW / el.naturalWidth, maxH / el.naturalHeight, 1);
      const w = Math.max(1, Math.round(el.naturalWidth * k));
      const h = Math.max(1, Math.round(el.naturalHeight * k));
      setImg(el);
      setNat({ w: el.naturalWidth, h: el.naturalHeight });
      setStage({ w, h });
      setSel({ x: 0, y: 0, w, h });
      setError('');
    };
    el.onerror = () => setError('图片读取失败');
    el.src = src;
  }, [src]);

  const startDrag = (mode: string) => (e: React.PointerEvent) => {
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, sel };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.mode === 'move') {
      setSel({
        ...d.sel,
        x: Math.min(Math.max(0, d.sel.x + dx), Math.max(0, stage.w - d.sel.w)),
        y: Math.min(Math.max(0, d.sel.y + dy), Math.max(0, stage.h - d.sel.h)),
      });
      return;
    }
    // 四角缩放：按边收放，保证不越界且不小于最小尺寸
    let l = d.sel.x;
    let t = d.sel.y;
    let r = d.sel.x + d.sel.w;
    let b = d.sel.y + d.sel.h;
    if (d.mode.includes('w')) l = Math.min(r - MIN_SIZE, Math.max(0, l + dx));
    if (d.mode.includes('e')) r = Math.max(l + MIN_SIZE, Math.min(stage.w, r + dx));
    if (d.mode.includes('n')) t = Math.min(b - MIN_SIZE, Math.max(0, t + dy));
    if (d.mode.includes('s')) b = Math.max(t + MIN_SIZE, Math.min(stage.h, b + dy));
    setSel({ x: l, y: t, w: r - l, h: b - t });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const reset = () => setSel({ x: 0, y: 0, w: stage.w, h: stage.h });

  const confirm = () => {
    if (!img || !stage.w || !stage.h) return;
    // 预览坐标 → 原图像素
    const kx = nat.w / stage.w;
    const ky = nat.h / stage.h;
    const sx = Math.max(0, Math.round(sel.x * kx));
    const sy = Math.max(0, Math.round(sel.y * ky));
    const sw = Math.max(1, Math.round(sel.w * kx));
    const sh = Math.max(1, Math.round(sel.h * ky));
    let outW = Math.min(sw, IMAGE_MAX_WIDTH);
    let outH = Math.max(1, Math.round(sh * (outW / sw)));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    const isPng = /\.png$/i.test(filename);
    const type = isPng ? 'image/png' : 'image/jpeg';
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const base = filename.replace(/\.[^.]+$/, '') || 'image';
        onDone(blob, `${base}-crop.${isPng ? 'png' : 'jpg'}`);
      },
      type,
      0.92,
    );
  };

  // 输出尺寸提示（按原图像素换算）
  const outW = stage.w ? Math.round(sel.w * (nat.w / stage.w)) : 0;
  const outH = stage.h ? Math.round(sel.h * (nat.h / stage.h)) : 0;

  const corner = (mode: string, style: React.CSSProperties) => (
    <span
      onPointerDown={startDrag(mode)}
      className="absolute w-3.5 h-3.5 rounded-sm bg-white border-2 border-green-500 touch-none"
      style={style}
    />
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[75] p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-xl w-full max-w-xl ${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-800'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h3 className="font-bold">裁剪图片</h3>
          <button onClick={onClose} className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center gap-3">
          {!img && !error && <p className="py-10 text-sm text-gray-400">图片加载中…</p>}
          {error && <p className="py-10 text-sm text-red-500">{error}</p>}
          {img && stage.w > 0 && (
            <>
              <div
                className="relative overflow-hidden rounded-lg bg-gray-900 touch-none select-none"
                style={{ width: stage.w, height: stage.h }}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 w-full h-full select-none"
                />
                {/* 选区：外圈用大阴影压暗，形成遮罩效果 */}
                <div
                  onPointerDown={startDrag('move')}
                  className="absolute cursor-move touch-none border border-white/90"
                  style={{
                    left: sel.x,
                    top: sel.y,
                    width: sel.w,
                    height: sel.h,
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                  }}
                >
                  {corner('nw', { left: -7, top: -7, cursor: 'nwse-resize' })}
                  {corner('ne', { right: -7, top: -7, cursor: 'nesw-resize' })}
                  {corner('sw', { left: -7, bottom: -7, cursor: 'nesw-resize' })}
                  {corner('se', { right: -7, bottom: -7, cursor: 'nwse-resize' })}
                </div>
              </div>
              <div className="flex items-center justify-between w-full">
                <span className="text-sm text-gray-400">
                  输出 {outW} × {outH} 像素
                </span>
                <button
                  onClick={reset}
                  className={`flex items-center gap-1 px-2 py-1 text-sm rounded-lg ${
                    isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  全图
                </button>
              </div>
            </>
          )}
        </div>

        <div className={`px-4 py-3 border-t flex gap-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={onClose}
            className={`flex-1 py-2 rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            取消
          </button>
          <button
            onClick={confirm}
            disabled={!img}
            className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            <Check className="w-4 h-4" />
            确定裁剪
          </button>
        </div>
      </div>
    </div>
  );
};
