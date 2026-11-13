// 图片裁剪 / 编辑弹窗
//
// 【与「分享卡片生成工具」(shareCard) 对齐】
// shareCard 的裁剪弹窗后来新增了：裁剪比例、画笔、马赛克、图片标签（含常用标签收藏）。
// 这里逐项移植过来，保证 smallChat 与 shareCard 的操作习惯一致。
// 代码中凡是以「对齐 shareCard」开头的注释，都是本次从 shareCard 移植/对齐的改动点，方便后续 agent 理解。
//
// 结构说明（重要）：
// - 预览区底层是一块 <canvas>（编辑画布），原图 + 画笔 + 马赛克 + 标签都画在它上面；
// - 裁剪框/四角手柄是叠在 canvas 之上的 HTML 元素，仅在「裁剪」工具下显示并接收指针事件；
// - 切换到画笔/马赛克/标签时，裁剪框隐藏，canvas 自己接收指针事件；
// - 编辑操作保存在 opsRef（整笔/整个标签为一条），「撤销」按条回退后重放整体重绘。
import { useEffect, useRef, useState } from 'react';
import { X, Check, RotateCcw, Undo2, Tag } from 'lucide-react';
import { IMAGE_MAX_WIDTH } from '../config';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Pt {
  x: number;
  y: number;
}

interface Props {
  src: string; // 待裁剪图片的 object URL
  filename: string; // 原文件名（决定输出格式与命名）
  isDarkMode: boolean;
  onDone: (blob: Blob, filename: string) => void;
  onClose: () => void;
}

const MIN_SIZE = 24; // 选区最小边长（预览像素）

// ---------- 对齐 shareCard：编辑操作与工具 ----------
// opsRef 里每条 = 一笔画笔 / 一笔马赛克 / 一个标签；撤销以整条为单位
type BrushOp = { type: 'brush'; color: string; size: number; pts: Pt[] };
type MosaicOp = { type: 'mosaic'; size: number; pts: Pt[] };
type LabelOp = {
  type: 'label';
  text: string;
  size: number;
  color: string; // 标签背景色
  textColor: string; // 标签文字色（默认按背景自动取黑/白）
  x: number; // 中心点（编辑画布坐标）
  y: number;
  rot: number; // 旋转角度 -180~180
  vertical: boolean; // 竖排文字
};
type EditOp = BrushOp | MosaicOp | LabelOp;
type Tool = 'crop' | 'brush' | 'mosaic' | 'label';

// 常用标签收藏（保存完整样式：文字/背景/文字色/字号/角度/横竖排）
// 存储 key 与 shareCard 相同，语义一致
const LABEL_FAV_KEY = 'shareCardLabelFavs';
type LabelFav = {
  text: string;
  color: string;
  textColor: string;
  size: number;
  rot: number;
  vertical: boolean;
};

// 可选颜色（画笔 / 标签背景）
const EDIT_COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#111827', '#FFFFFF'];
// 标签文字颜色
const LABEL_TEXT_COLORS = ['#FFFFFF', '#111827', '#EF4444', '#F59E0B', '#10B981', '#3B82F6'];
// 编辑画布最长边：够清晰又不会卡（与 shareCard 一致）
const EDIT_MAX = 1600;

// 裁剪比例（0 = 自由）
const RATIOS: { label: string; value: number }[] = [
  { label: '自由', value: 0 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

// 颜色亮度：用于给标签文字自动挑黑/白（白底白字会看不见）
const colorLum = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const contrastText = (bg: string) => (colorLum(bg) > 0.6 ? '#111827' : '#FFFFFF');

// 【对齐 shareCard】标签字体：600 字重（shareCard 的 drawLabel 用 600，不要改成 700）
const labelFont = (size: number) => `600 ${size}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;

type LabelBox = { w: number; h: number; chars?: string[]; lineH?: number };

// 【对齐 shareCard】标签外框：规则与 shareCard 的 labelBox 完全一致
// - 横排：高 = 字号 × 1.7；宽至少 字号 × 1.7，文字长时按实测宽度再加 1.2 字内边距
// - 竖排：宽 = 字号 × 1.75，每个字一行（行高 = 字号 × 1.12），上下各留 0.28 字号
// 必须先设好 ctx.font，measureText 才准确
const labelBox = (ctx: CanvasRenderingContext2D, l: LabelOp): LabelBox => {
  ctx.font = labelFont(l.size);
  if (l.vertical) {
    const chars = Array.from(l.text);
    const lineH = l.size * 1.12;
    return { w: l.size * 1.75, h: chars.length * lineH + l.size * 0.56, chars, lineH };
  }
  const tw = ctx.measureText(l.text).width;
  return { w: Math.max(l.size * 1.7, tw + l.size * 1.2), h: l.size * 1.7 };
};

// 【对齐 shareCard】标签背景路径：圆角半径取短边一半 → 胶囊形（shareCard 用 arcTo 画同样形状）
const labelPath = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + r, -h / 2);
  ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
  ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
  ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
  ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
  ctx.closePath();
};

// 【对齐 shareCard】常用标签去重键：文字 + 横/竖方向相同即视为同一条（收藏时覆盖旧样式）
const favKey = (f: LabelFav) => `${f.text}|${f.vertical ? 1 : 0}`;

// 把一条（可能来自旧版本的）收藏整理成标准结构
const normalizeFav = (x: unknown): LabelFav | null => {
  if (typeof x === 'string') {
    const text = x.trim();
    if (!text) return null;
    return { text, color: EDIT_COLORS[0], textColor: contrastText(EDIT_COLORS[0]), size: 50, rot: 0, vertical: false };
  }
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const text = String(o.text ?? '').trim();
  if (!text) return null;
  const color = typeof o.color === 'string' ? o.color : EDIT_COLORS[0];
  return {
    text,
    color,
    textColor: typeof o.textColor === 'string' ? o.textColor : contrastText(color),
    size: typeof o.size === 'number' ? Math.min(200, Math.max(14, o.size)) : 50,
    rot: typeof o.rot === 'number' ? Math.max(-180, Math.min(180, o.rot)) : 0,
    vertical: !!o.vertical,
  };
};

// 读本地收藏；数据损坏时按空处理（不能影响弹窗打开）
// 【对齐 shareCard】同文字同方向只保留最后保存的一条（旧数据可能残留重复）
const loadFavs = (): LabelFav[] => {
  try {
    const raw = localStorage.getItem(LABEL_FAV_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const seen: Record<string, boolean> = {};
    const out: LabelFav[] = [];
    arr
      .map(normalizeFav)
      .filter((f): f is LabelFav => !!f)
      .reverse()
      .forEach((f) => {
        const k = favKey(f);
        if (seen[k]) return;
        seen[k] = true;
        out.push(f);
      });
    return out.reverse().slice(0, 20);
  } catch {
    return [];
  }
};

const favSig = (f: LabelFav) => `${f.text}|${f.color}|${f.textColor}|${f.size}|${f.rot}|${f.vertical ? 1 : 0}`;

// 普通图片裁剪 + 编辑（裁剪比例 / 画笔 / 马赛克 / 标签）
export const ImageCropModal = ({ src, filename, isDarkMode, onDone, onClose }: Props) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [nat, setNat] = useState({ w: 0, h: 0 }); // 原图尺寸
  const [stage, setStage] = useState({ w: 0, h: 0 }); // 预览显示尺寸
  const [sel, setSel] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [error, setError] = useState('');
  const dragRef = useRef<{ mode: string; sx: number; sy: number; sel: Rect } | null>(null);

  // ---------- 对齐 shareCard：新增的状态 ----------
  const [ratio, setRatio] = useState(0); // 裁剪比例；每次打开默认「自由」
  const [tool, setTool] = useState<Tool>('crop');
  const [brushColor, setBrushColor] = useState(EDIT_COLORS[0]);
  const [brushSize, setBrushSize] = useState(10);
  const [mosaicSize, setMosaicSize] = useState(16);
  const [labelColor, setLabelColor] = useState(EDIT_COLORS[0]);
  const [labelTextColor, setLabelTextColor] = useState('#FFFFFF');
  const [labelSize, setLabelSize] = useState(50);
  const [labelVertical, setLabelVertical] = useState(false);
  // 选中标签的旋转角度：单独用 state 驱动滑杆（标签对象是 ref 里的可变对象，改它不会触发重渲染）
  const [labelRot, setLabelRot] = useState(0);
  const [selLabel, setSelLabelState] = useState<LabelOp | null>(null);
  const [undoLen, setUndoLen] = useState(0);
  const [favs, setFavs] = useState<LabelFav[]>(() => loadFavs());
  const [textDlg, setTextDlg] = useState<{ mode: 'add' | 'edit'; value: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const editSizeRef = useRef({ w: 0, h: 0 }); // 编辑画布真实像素尺寸
  const opsRef = useRef<EditOp[]>([]); // 编辑操作（撤销/重绘依据）
  // 当前选中的标签：画布绘制需要同步读取，故用 ref 与 state 双写
  const selRef = useRef<LabelOp | null>(null);
  const setSelLabel = (l: LabelOp | null) => {
    selRef.current = l;
    setSelLabelState(l);
  };
  // 指针按下后正在进行的编辑动作（画笔/马赛克只记 op；拖动标签额外记相对偏移与起点）
  const editDragRef = useRef<{
    op?: BrushOp | MosaicOp;
    label?: LabelOp;
    dx?: number;
    dy?: number;
    sx?: number;
    sy?: number;
  } | null>(null);
  // 【对齐 shareCard】自行识别「双击标签」：上一次点击的标签/时间/位置
  // 触屏和部分浏览器不派发 dblclick，所以 pointerup 里自己判断（400ms、24px 内）
  const labelTapPrevRef = useRef<{ label: LabelOp; t: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = new Image();
    el.onload = () => {
      // 预览区：适配视口，小图不放大（与 shareCard 一致：宽度留 64px，高度最多 55%/460px）
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

  // ---------- 对齐 shareCard：编辑画布初始化（原图铺底，清空历史操作） ----------
  useEffect(() => {
    const cv = canvasRef.current;
    if (!img || !stage.w || !cv) return;
    // 编辑画布按原图比例、最长边不超过 EDIT_MAX
    const w = Math.max(1, Math.min(img.naturalWidth, EDIT_MAX));
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
    cv.width = w;
    cv.height = h;
    editSizeRef.current = { w, h };
    // willReadFrequently 强制软件渲染：安卓 Firefox 硬件加速画布处理大图会输出全黑
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctxRef.current = ctx;
    if (ctx) ctx.imageSmoothingQuality = 'high';
    opsRef.current = [];
    selRef.current = null;
    setSelLabelState(null);
    setUndoLen(0);
    // 新图重置交互中间态，避免沿用上一张图的双击/拖动记忆
    editDragRef.current = null;
    labelTapPrevRef.current = null;
    setTool('crop');
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, stage.w, stage.h]);

  // ---------- 画布绘制核心（对齐 shareCard 的 redrawEdit / drawLabel） ----------
  const drawLabel = (
    ctx: CanvasRenderingContext2D,
    l: LabelOp,
    selected: boolean,
  ) => {
    const box = labelBox(ctx, l);
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.rotate((l.rot * Math.PI) / 180);
    // 【对齐 shareCard】标签底色 95% 不透明，圆角胶囊
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = l.color;
    labelPath(ctx, box.w, box.h);
    ctx.fill();
    // 文字：竖排逐字居中，横排整体居中（y 用 0.04 字号微调视觉重心）
    ctx.globalAlpha = 1;
    ctx.fillStyle = l.textColor || contrastText(l.color);
    ctx.font = labelFont(l.size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (l.vertical && box.chars) {
      const lineH = box.lineH ?? l.size * 1.12;
      const chars = box.chars;
      const startY = -(chars.length * lineH) / 2 + lineH / 2;
      chars.forEach((ch, i) => ctx.fillText(ch, 0, startY + i * lineH));
    } else {
      ctx.fillText(l.text, 0, l.size * 0.04);
    }
    // 选中：沿标签自身轮廓画绿色虚线（旋转后自然跟随标签，与 shareCard 一致）
    if (selected) {
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = Math.max(2, l.size * 0.09);
      ctx.setLineDash([Math.max(5, l.size * 0.25), Math.max(4, l.size * 0.18)]);
      labelPath(ctx, box.w, box.h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  };

  // 画笔一段（增量绘制用）
  const paintBrush = (ctx: CanvasRenderingContext2D, op: BrushOp) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = op.color;
    ctx.lineWidth = op.size;
    if (op.pts.length === 1) {
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.arc(op.pts[0].x, op.pts[0].y, op.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      op.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();
  };

  // 马赛克：把每个点周围的小块先缩到 1/4 再放大画回，形成像素块
  const paintMosaic = (ctx: CanvasRenderingContext2D, op: MosaicOp, onlyLast = false) => {
    const size = Math.max(8, op.size);
    const block = 4;
    const bw = Math.round(size);
    const tw = Math.max(1, Math.ceil(bw / block));
    const tmp = document.createElement('canvas');
    tmp.width = tw;
    tmp.height = tw;
    const tctx = tmp.getContext('2d');
    if (!tctx) return;
    // 快速拖动时补点，避免出现断断续续的空隙
    const pts: Pt[] = [];
    const src = onlyLast ? op.pts.slice(-2) : op.pts;
    src.forEach((p, i) => {
      const prev = src[i - 1];
      if (i > 0 && prev) {
        const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
        const steps = Math.min(24, Math.floor(dist / (size / 3)));
        for (let s = 1; s <= steps; s++) {
          pts.push({ x: prev.x + ((p.x - prev.x) * s) / steps, y: prev.y + ((p.y - prev.y) * s) / steps });
        }
      }
      pts.push(p);
    });
    for (const p of pts) {
      const bx = Math.round(p.x - bw / 2);
      const by = Math.round(p.y - bw / 2);
      tctx.clearRect(0, 0, tw, tw);
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(ctx.canvas, bx, by, bw, bw, 0, 0, tw, tw);
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tw, tw, bx, by, tw * block, tw * block);
      ctx.restore();
    }
  };

  const paintOp = (ctx: CanvasRenderingContext2D, op: EditOp) => {
    if (op.type === 'brush') paintBrush(ctx, op);
    else if (op.type === 'mosaic') paintMosaic(ctx, op);
    else drawLabel(ctx, op, op === selRef.current);
  };

  // 整块重绘：底图 → 依次重放操作（撤销、选中变化后调用）
  function redraw() {
    const ctx = ctxRef.current;
    const el = img;
    if (!ctx || !el) return;
    const { w, h } = editSizeRef.current;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(el, 0, 0, w, h);
    opsRef.current.forEach((op) => paintOp(ctx, op));
  }

  // ---------- 裁剪框：比例锁定的几何计算 ----------
  const clampRect = (r: Rect): Rect => {
    const w = Math.max(MIN_SIZE, Math.min(r.w, stage.w));
    const h = Math.max(MIN_SIZE, Math.min(r.h, stage.h));
    return {
      x: Math.min(Math.max(0, r.x), Math.max(0, stage.w - w)),
      y: Math.min(Math.max(0, r.y), Math.max(0, stage.h - h)),
      w,
      h,
    };
  };

  // 【对齐 shareCard】把当前选区收成指定比例：保持中心点，超出画布则等比缩小
  const fitToRatio = (r: number, cur: Rect): Rect => {
    if (!r || !stage.w || !stage.h) return clampRect(cur);
    const cx = cur.x + cur.w / 2;
    const cy = cur.y + cur.h / 2;
    let w = Math.max(MIN_SIZE, cur.w);
    let h = w / r;
    if (h > stage.h) {
      h = stage.h;
      w = h * r;
    }
    if (w > stage.w) {
      w = stage.w;
      h = w / r;
    }
    return {
      x: Math.min(Math.max(0, cx - w / 2), Math.max(0, stage.w - w)),
      y: Math.min(Math.max(0, cy - h / 2), Math.max(0, stage.h - h)),
      w,
      h,
    };
  };

  const pickRatio = (r: number) => {
    setRatio(r);
    setSel((cur) => fitToRatio(r, cur));
  };

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
      setSel(clampRect({ ...d.sel, x: d.sel.x + dx, y: d.sel.y + dy }));
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
    // 【对齐 shareCard】锁定比例：以变化更大的一边换算，对角作为锚点
    if (ratio > 0) {
      const mode = d.mode;
      let w: number;
      let h: number;
      if (Math.abs(dx) >= Math.abs(dy)) {
        w = Math.max(MIN_SIZE, d.sel.w + (mode.includes('e') ? dx : -dx));
        h = w / ratio;
      } else {
        h = Math.max(MIN_SIZE, d.sel.h + (mode.includes('s') ? dy : -dy));
        w = h * ratio;
      }
      const maxW = mode.includes('e') ? stage.w - d.sel.x : d.sel.x + d.sel.w;
      const maxH = mode.includes('s') ? stage.h - d.sel.y : d.sel.y + d.sel.h;
      const k = Math.min(1, maxW / w, maxH / h);
      w = Math.max(MIN_SIZE, w * k);
      h = Math.max(MIN_SIZE, h * k);
      setSel({
        x: mode.includes('e') ? d.sel.x : d.sel.x + d.sel.w - w,
        y: mode.includes('s') ? d.sel.y : d.sel.y + d.sel.h - h,
        w,
        h,
      });
      return;
    }
    setSel({ x: l, y: t, w: r - l, h: b - t });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // 【对齐 shareCard】全图复位：保留当前比例，居中最大适配
  const reset = () => setSel(fitToRatio(ratio, { x: 0, y: 0, w: stage.w, h: stage.h }));

  // ---------- 对齐 shareCard：指针坐标 → 编辑画布坐标 ----------
  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const r = cv.getBoundingClientRect();
    const { w, h } = editSizeRef.current;
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * w,
      y: ((e.clientY - r.top) / Math.max(1, r.height)) * h,
    };
  };

  // 点中哪个标签（从后往前，最后画的在最上层）；旋转过的按逆旋转回到标签本地坐标判断
  const hitLabel = (p: Pt): LabelOp | null => {
    const ctx = ctxRef.current;
    if (!ctx) return null;
    for (let i = opsRef.current.length - 1; i >= 0; i--) {
      const op = opsRef.current[i];
      if (op.type !== 'label') continue;
      const box = labelBox(ctx, op);
      const rad = (-op.rot * Math.PI) / 180;
      const dx = p.x - op.x;
      const dy = p.y - op.y;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      if (Math.abs(lx) <= box.w / 2 && Math.abs(ly) <= box.h / 2) return op;
    }
    return null;
  };

  // 选区中心 → 编辑画布坐标（新增标签落在裁剪框中间）
  const selCenterInEdit = (): Pt => {
    const { w, h } = editSizeRef.current;
    const kx = stage.w ? w / stage.w : 1;
    const ky = stage.h ? h / stage.h : 1;
    return { x: (sel.x + sel.w / 2) * kx, y: (sel.y + sel.h / 2) * ky };
  };

  // 新增标签（也用于「常用标签」一键套用）
  const pushLabel = (text: string, style?: Partial<LabelFav>) => {
    const t = text.trim();
    if (!t) return;
    const color = style?.color ?? labelColor;
    let textColor = style?.textColor ?? labelTextColor;
    // 文字色与背景太接近时自动换成黑/白，保证看得清
    if (Math.abs(colorLum(textColor) - colorLum(color)) < 0.35) textColor = contrastText(color);
    const op: LabelOp = {
      type: 'label',
      text: t,
      size: style?.size ?? labelSize,
      color,
      textColor,
      x: 0,
      y: 0,
      rot: style?.rot ?? 0,
      vertical: style?.vertical ?? labelVertical,
    };
    const c = selCenterInEdit();
    op.x = c.x;
    op.y = c.y;
    opsRef.current.push(op);
    setUndoLen(opsRef.current.length);
    setSelLabel(op);
    setLabelColor(color);
    setLabelTextColor(textColor);
    setLabelSize(op.size);
    setLabelVertical(op.vertical);
    setLabelRot(op.rot);
    redraw();
  };

  const canvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'crop' || !ctxRef.current) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    if (tool === 'brush') {
      const op: BrushOp = { type: 'brush', color: brushColor, size: brushSize, pts: [p] };
      opsRef.current.push(op);
      editDragRef.current = { op };
      paintBrush(ctxRef.current, op);
      setUndoLen(opsRef.current.length);
      return;
    }
    if (tool === 'mosaic') {
      const op: MosaicOp = { type: 'mosaic', size: mosaicSize, pts: [p] };
      opsRef.current.push(op);
      editDragRef.current = { op };
      paintMosaic(ctxRef.current, op);
      setUndoLen(opsRef.current.length);
      return;
    }
    // 标签工具：点中标签 = 选中并准备拖动（同时把样式同步到下方控件）；点空白 = 取消选中
    const hit = hitLabel(p);
    selectAndSync(hit);
    if (hit) {
      editDragRef.current = { label: hit, dx: p.x - hit.x, dy: p.y - hit.y, sx: p.x, sy: p.y };
    } else {
      labelTapPrevRef.current = null;
    }
  };

  const canvasMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = editDragRef.current;
    const ctx = ctxRef.current;
    if (!d || !ctx) return;
    const p = canvasPoint(e);
    if (d.op) {
      const op = d.op;
      const last = op.pts[op.pts.length - 1];
      // 采样间隔：太小会卡，太大马赛克会断（与 shareCard 一致：画笔 1/6、马赛克 1/2 笔触）
      if (Math.hypot(p.x - last.x, p.y - last.y) < (op.type === 'mosaic' ? Math.max(2, op.size / 2) : Math.max(2, op.size / 6))) {
        return;
      }
      op.pts.push(p);
      if (op.type === 'brush') {
        // 只画最新一段，避免整块重绘导致卡顿
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.size;
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
      } else {
        paintMosaic(ctx, op, true);
      }
      return;
    }
    if (d.label) {
      // 【对齐 shareCard】标签位置不夹取：允许贴边/部分移出画布
      d.label.x = p.x - (d.dx ?? 0);
      d.label.y = p.y - (d.dy ?? 0);
      redraw();
    }
  };

  // 【对齐 shareCard】抬手时判断是否「双击标签」→ 打开改文字弹窗（触屏也能用）
  const canvasUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = editDragRef.current;
    editDragRef.current = null;
    if (!active || !active.label || tool !== 'label' || e.type === 'pointercancel') return;
    const p = canvasPoint(e);
    // 拖动过就不算点击
    if (Math.hypot(p.x - (active.sx ?? 0), p.y - (active.sy ?? 0)) > 8) return;
    const now = Date.now();
    const prev = labelTapPrevRef.current;
    if (prev && prev.label === active.label && now - prev.t < 400 && Math.hypot(p.x - prev.x, p.y - prev.y) < 24) {
      labelTapPrevRef.current = null;
      const target = active.label;
      // 延后到本次点击序列结束再弹窗，避免被随后的 click/mouseup 误触
      window.setTimeout(() => {
        selectAndSync(target);
        setTextDlg({ mode: 'edit', value: target.text });
      }, 30);
      return;
    }
    labelTapPrevRef.current = { label: active.label, t: now, x: p.x, y: p.y };
  };

  // 双击标签 = 改文字（桌面端 dblclick 兜底；触屏主要靠上面的 canvasUp 双击识别）
  const canvasDblClick = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'label' || textDlg) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { w, h } = editSizeRef.current;
    const p = {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * w,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * h,
    };
    const hit = hitLabel(p);
    if (hit) {
      selectAndSync(hit);
      setTextDlg({ mode: 'edit', value: hit.text });
    }
  };

  const undo = () => {
    const op = opsRef.current.pop();
    if (!op) return;
    if (op === selRef.current) setSelLabel(null);
    setUndoLen(opsRef.current.length);
    redraw();
  };

  // 选中标签时把它的样式同步到下方控件，避免「显示的值」和「标签实际样式」不一致
  const selectAndSync = (l: LabelOp | null) => {
    setSelLabel(l);
    if (l) {
      setLabelColor(l.color);
      setLabelTextColor(l.textColor || contrastText(l.color));
      setLabelSize(l.size);
      setLabelVertical(l.vertical);
      setLabelRot(l.rot);
    } else {
      setLabelRot(0);
    }
    redraw();
  };

  const applyLabelPatch = (patch: Partial<LabelOp>) => {
    const l = selRef.current;
    if (!l) return;
    Object.assign(l, patch);
    setLabelSize(l.size);
    setLabelColor(l.color);
    setLabelTextColor(l.textColor);
    setLabelVertical(l.vertical);
    if (patch.rot !== undefined) setLabelRot(l.rot);
    redraw();
  };

  // 背景色：改默认值 + 同步选中标签；只有文字色与背景对比不足时才自动换成黑/白（与 shareCard 一致）
  const pickLabelBg = (c: string) => {
    setLabelColor(c);
    const l = selRef.current;
    const target = l ? l.textColor : labelTextColor;
    const tc = Math.abs(colorLum(target) - colorLum(c)) < 0.35 ? contrastText(c) : target;
    setLabelTextColor(tc);
    if (l) {
      l.color = c;
      l.textColor = tc;
      redraw();
    }
  };

  const pickLabelTextColor = (c: string) => {
    setLabelTextColor(c);
    const l = selRef.current;
    if (l) {
      l.textColor = c;
      redraw();
    }
  };

  // 【对齐 shareCard】常用标签收藏：文字 + 横/竖方向相同则覆盖旧样式（不新增）；
  // 最多 20 条，满了不再添加
  const addFav = (l: LabelOp) => {
    const f: LabelFav = {
      text: l.text,
      color: l.color,
      textColor: l.textColor || contrastText(l.color),
      size: l.size,
      rot: l.rot,
      vertical: l.vertical,
    };
    setFavs((prev) => {
      const key = favKey(f);
      const idx = prev.findIndex((x) => favKey(x) === key);
      let next: LabelFav[];
      if (idx >= 0) {
        next = prev.slice();
        next[idx] = f;
      } else {
        if (prev.length >= 20) return prev;
        next = prev.concat(f);
      }
      try {
        localStorage.setItem(LABEL_FAV_KEY, JSON.stringify(next.slice(0, 20)));
      } catch {
        // 存储满/隐私模式禁写：不影响本次使用
      }
      return next;
    });
  };

  const delFav = (f: LabelFav) => {
    setFavs((prev) => {
      const next = prev.filter((x) => favSig(x) !== favSig(f));
      try {
        localStorage.setItem(LABEL_FAV_KEY, JSON.stringify(next));
      } catch {
        // 同上
      }
      return next;
    });
  };

  const confirmTextDlg = () => {
    if (!textDlg) return;
    const text = textDlg.value.trim();
    if (textDlg.mode === 'add') {
      // 【对齐 shareCard】空文字直接忽略（不新增标签）
      if (text) pushLabel(text);
    } else {
      const l = selRef.current;
      if (l && text) {
        l.text = text;
        redraw();
      }
    }
    setTextDlg(null);
  };

  const confirm = () => {
    const cv = canvasRef.current;
    if (!img || !stage.w || !stage.h || !cv) return;
    // 预览坐标 → 编辑画布像素 → 按原图比例换算回原图像素
    const kx = cv.width / stage.w;
    const ky = cv.height / stage.h;
    const sx = Math.max(0, Math.round(sel.x * kx));
    const sy = Math.max(0, Math.round(sel.y * ky));
    const sw = Math.max(1, Math.round(sel.w * kx));
    const sh = Math.max(1, Math.round(sel.h * ky));
    let outW = Math.min(sw, IMAGE_MAX_WIDTH);
    let outH = Math.max(1, Math.round(sh * (outW / sw)));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    // willReadFrequently 强制软件渲染画布：安卓 Firefox 硬件加速画布裁剪大图会输出全黑
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    // 【对齐 shareCard】从编辑画布取图：画笔/马赛克/标签会一起进入最终图片
    ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, outW, outH);
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

  // 输出尺寸提示（按原图像素换算；因画布可能降到 EDIT_MAX，这里按原图比例估算）
  const outW = stage.w ? Math.round(sel.w * (nat.w / stage.w)) : 0;
  const outH = stage.h ? Math.round(sel.h * (nat.h / stage.h)) : 0;

  const corner = (mode: string, style: React.CSSProperties) => (
    <span
      onPointerDown={startDrag(mode)}
      className="absolute w-7 h-7 rounded-sm bg-white border-2 border-green-500 touch-none"
      style={style}
    />
  );

  // ---------- 小控件（统一 14px 以上字号，深色模式自动适配） ----------
  const chipCls = (active: boolean) =>
    `px-2.5 h-7 rounded-full text-sm border transition-colors ${
      active
        ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
        : isDarkMode
          ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
          : 'border-gray-300 text-gray-600 hover:bg-gray-100'
    }`;

  const chip = (label: string, active: boolean, onClick: () => void, disabled = false) => (
    <button
      key={label}
      onClick={onClick}
      disabled={disabled}
      className={`${chipCls(active)} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  );

  const swatch = (c: string, active: boolean, onClick: () => void) => (
    <button
      key={c}
      onClick={onClick}
      title={c}
      className={`w-6 h-6 rounded-full border-2 flex-shrink-0 ${
        active ? 'border-green-500' : isDarkMode ? 'border-gray-600' : 'border-gray-300'
      }`}
      style={{ backgroundColor: c }}
    />
  );

  const rowLabel = (text: string) => (
    <span className={`w-16 flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{text}</span>
  );

  const miniReset = (onClick: () => void, title: string) => (
    <button
      onClick={onClick}
      title={title}
      className={`p-1 rounded-md ${isDarkMode ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-400 hover:bg-gray-200'}`}
    >
      <RotateCcw className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[75] p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-xl w-full max-w-xl max-h-full flex flex-col overflow-hidden ${
          isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <h3 className="font-bold">编辑图片</h3>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 flex flex-col items-center gap-2 overflow-y-auto">
          {!img && !error && <p className="py-10 text-sm text-gray-400">图片加载中…</p>}
          {error && <p className="py-10 text-sm text-red-500">{error}</p>}
          {img && stage.w > 0 && (
            <>
              {/* 【对齐 shareCard】工具条：裁剪 / 画笔 / 马赛克 / 标签 + 撤销 */}
              <div className="flex items-center gap-1.5 flex-wrap w-full">
                {chip('裁剪', tool === 'crop', () => {
                  setTool('crop');
                  selectAndSync(null);
                })}
                {chip('画笔', tool === 'brush', () => {
                  setTool('brush');
                  selectAndSync(null);
                })}
                {chip('马赛克', tool === 'mosaic', () => {
                  setTool('mosaic');
                  selectAndSync(null);
                })}
                {chip('标签', tool === 'label', () => {
                  setTool('label');
                  selectAndSync(null);
                })}
                {tool === 'label' && (
                  <button
                    onClick={() => setTextDlg({ mode: 'add', value: '' })}
                    title="添加标签"
                    className="w-[30px] h-7 flex items-center justify-center rounded-md bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300"
                  >
                    <Tag className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={undo}
                  disabled={!undoLen}
                  className={`ml-auto flex items-center gap-0.5 px-2 h-7 rounded-full text-sm border disabled:opacity-40 disabled:cursor-not-allowed ${
                    isDarkMode ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Undo2 className="w-4 h-4" />
                  撤销
                </button>
              </div>

              {/* 【对齐 shareCard】当前工具的选项区（裁剪比例不显示文字标签，节省空间） */}
              <div
                className={`w-full rounded-lg px-2 py-2 flex flex-col gap-1.5 ${
                  isDarkMode ? 'bg-gray-700/40' : 'bg-gray-50'
                }`}
              >
                {tool === 'crop' && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {RATIOS.map((r) => chip(r.label, ratio === r.value, () => pickRatio(r.value)))}
                  </div>
                )}

                {tool === 'brush' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      {EDIT_COLORS.map((c) => swatch(c, brushColor === c, () => setBrushColor(c)))}
                    </div>
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>粗细</span>
                    <input
                      type="range"
                      min={4}
                      max={40}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="flex-1 min-w-[60px] accent-green-500"
                    />
                    <span className={`text-sm w-8 text-right ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {brushSize}
                    </span>
                  </div>
                )}

                {tool === 'mosaic' && (
                  <div className="flex items-center gap-2">
                    {rowLabel('块大小')}
                    <input
                      type="range"
                      min={8}
                      max={40}
                      value={mosaicSize}
                      onChange={(e) => setMosaicSize(Number(e.target.value))}
                      className="flex-1 min-w-[60px] accent-green-500"
                    />
                    <span className={`text-sm w-8 text-right ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {mosaicSize}
                    </span>
                  </div>
                )}

                {tool === 'label' && (
                  <>
                    {/* 常用标签：点一下就在选区中心插入同款样式；徽章「横/竖」区分横排与竖排 */}
                    <div className="flex items-start gap-2">
                      {rowLabel('常用')}
                      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                        {favs.length === 0 && (
                          <span className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            选中标签后点「收藏」，下次可一键插入
                          </span>
                        )}
                        {favs.map((f) => (
                          <div
                            key={favSig(f)}
                            className={`flex items-center rounded-full overflow-hidden border ${
                              isDarkMode ? 'border-gray-600' : 'border-gray-300'
                            }`}
                          >
                            <button
                              onClick={() => pushLabel(f.text, f)}
                              className="flex items-center gap-1 pl-2 pr-1 h-7 text-sm max-w-[110px]"
                              style={{ backgroundColor: f.color, color: f.textColor || contrastText(f.color) }}
                              title="套用这个标签样式"
                            >
                              <span className="truncate">{f.text}</span>
                              <span className="text-[11px] px-1 rounded bg-black/15 flex-shrink-0">
                                {f.vertical ? '竖' : '横'}
                              </span>
                            </button>
                            <button
                              onClick={() => delFav(f)}
                              className={`w-6 h-7 text-sm ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
                              title="删除这个收藏"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 选中标签的操作：未选中时置灰但保留位置，避免面板高度跳动 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {rowLabel('选中')}
                      <button
                        onClick={() => setTextDlg({ mode: 'edit', value: selLabel?.text ?? '' })}
                        disabled={!selLabel}
                        className={`${chipCls(false)} disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        改文字
                      </button>
                      <button
                        onClick={() => applyLabelPatch({ vertical: !labelVertical })}
                        disabled={!selLabel}
                        title="横排 / 竖排切换"
                        className={`${chipCls(false)} disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {labelVertical ? '横排' : '竖排'}
                      </button>
                      <button
                        onClick={() => selLabel && addFav(selLabel)}
                        disabled={!selLabel}
                        className={`${chipCls(false)} disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        收藏
                      </button>
                      <button
                        onClick={() => {
                          if (!selRef.current) return;
                          opsRef.current = opsRef.current.filter((op) => op !== selRef.current);
                          setUndoLen(opsRef.current.length);
                          selectAndSync(null);
                        }}
                        disabled={!selLabel}
                        className="px-2.5 h-7 rounded-full text-sm border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
                      >
                        删除
                      </button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {rowLabel('背景')}
                      {EDIT_COLORS.map((c) => swatch(c, labelColor === c, () => pickLabelBg(c)))}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {rowLabel('文字')}
                      {LABEL_TEXT_COLORS.map((c) => swatch(c, labelTextColor === c, () => pickLabelTextColor(c)))}
                    </div>

                    <div className="flex items-center gap-2">
                      {rowLabel('字号')}
                      <input
                        type="range"
                        min={14}
                        max={200}
                        value={labelSize}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setLabelSize(v);
                          const l = selRef.current;
                          if (l) {
                            l.size = v;
                            redraw();
                          }
                        }}
                        className="flex-1 min-w-[60px] accent-green-500"
                      />
                      <span className={`text-sm w-9 text-right ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {labelSize}
                      </span>
                      {miniReset(() => {
                        setLabelSize(50);
                        const l = selRef.current;
                        if (l) {
                          l.size = 50;
                          redraw();
                        }
                      }, '字号恢复默认 50')}
                    </div>

                    <div className="flex items-center gap-2">
                      {rowLabel('角度')}
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={labelRot}
                        disabled={!selLabel}
                        onChange={(e) => applyLabelPatch({ rot: Number(e.target.value) })}
                        className="flex-1 min-w-[60px] accent-green-500 disabled:opacity-40"
                      />
                      <span className={`text-sm w-10 text-right ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {labelRot}°
                      </span>
                      {miniReset(() => applyLabelPatch({ rot: 0 }), '角度恢复 0°')}
                    </div>
                  </>
                )}
              </div>

              <div
                className="relative overflow-hidden rounded-lg bg-gray-900 touch-none select-none"
                style={{ width: stage.w, height: stage.h }}
                onPointerMove={onMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {/* 【对齐 shareCard】底图 + 编辑内容都在这块画布上；裁剪时画布不接收指针事件。
                    画笔/马赛克显示十字光标，标签显示 copy 光标（同 shareCard 的 .painting/.labelling） */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full select-none"
                  style={{
                    pointerEvents: tool === 'crop' ? 'none' : 'auto',
                    touchAction: 'none',
                    cursor: tool === 'crop' ? 'default' : tool === 'label' ? 'copy' : 'crosshair',
                  }}
                  onPointerDown={canvasDown}
                  onPointerMove={canvasMove}
                  onPointerUp={canvasUp}
                  onPointerCancel={canvasUp}
                  onDoubleClick={canvasDblClick}
                />
                {/* 裁剪框：仅裁剪工具下显示并接收事件；外圈用大阴影压暗形成遮罩 */}
                {tool === 'crop' && (
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
                    {corner('nw', { left: -14, top: -14, cursor: 'nwse-resize' })}
                    {corner('ne', { right: -14, top: -14, cursor: 'nesw-resize' })}
                    {corner('sw', { left: -14, bottom: -14, cursor: 'nesw-resize' })}
                    {corner('se', { right: -14, bottom: -14, cursor: 'nwse-resize' })}
                  </div>
                )}
              </div>

              {/* 【对齐 shareCard】输出尺寸与「全图」只在裁剪工具下显示，画笔/马赛克/标签时隐藏，节省空间 */}
              {tool === 'crop' && (
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
              )}
            </>
          )}
        </div>

        <div
          className={`px-4 py-3 border-t flex gap-2 flex-shrink-0 ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
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

        {/* 标签文字输入：层级高于整个裁剪弹窗（z-[95]），双击标签或点「改文字/添加文字」时打开 */}
        {textDlg && (
          <div
            className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4"
            onClick={() => setTextDlg(null)}
          >
            <div
              className={`w-full max-w-xs rounded-2xl p-4 ${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-800'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-medium mb-2">{textDlg.mode === 'add' ? '添加图片标签' : '修改标签文字'}</p>
              <input
                autoFocus
                value={textDlg.value}
                onChange={(e) => setTextDlg({ ...textDlg, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmTextDlg();
                  if (e.key === 'Escape') setTextDlg(null);
                }}
                placeholder="输入标签文字"
                className={`w-full px-3 py-2 rounded-lg text-sm outline-none ${
                  isDarkMode ? 'bg-gray-700 text-white placeholder-gray-400' : 'bg-gray-100 text-gray-800 placeholder-gray-400'
                }`}
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setTextDlg(null)}
                  className={`flex-1 py-2 rounded-lg text-sm ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  取消
                </button>
                <button
                  onClick={confirmTextDlg}
                  className="flex-1 py-2 rounded-lg text-sm bg-green-500 text-white font-medium hover:bg-green-600"
                >
                  {textDlg.mode === 'add' ? '添加' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
