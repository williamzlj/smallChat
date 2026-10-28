// 「生成分享卡片」弹窗：把一条或多条消息（文字/图片混排）渲染成高清 PNG，方便发朋友圈/抖音
// 字号/字体/边距/卡片签名/日期署名开关仅记在浏览器 localStorage，不进后端数据库
import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { X, ImageDown, Share2, Loader2, Bold, Copy, Check, Pipette, RotateCcw } from 'lucide-react';
import { ChatMessage } from '../api/types';
import { API_BASE } from '../config';
import { tokenStore } from '../api/client';

interface Props {
  messages: ChatMessage[]; // 单条卡片传长度 1 的数组；多条按时间正序
  cardSignature: string; // 服务器上的卡片签名：仅作首次迁移的初始值（本地无签名时采用），此后以 localStorage 为准
  isDarkMode: boolean;
  onClose: () => void;
}

type CardTheme = 'light' | 'dark' | 'blue' | 'orange' | 'green' | 'custom';

// 卡片配色固定，不随 App 暗色模式变化（弹窗内单独切换）；蓝/橙/绿为分享向低饱和配色
// 各样式差异只在 5 个颜色：卡片背景 bg / 正文 text / 辅助文字（日期、署名、昵称）aux /
// 强调色（双引号、竖线、署名小方块）quote / 分割线 line；custom 这 5 项由用户逐项覆盖
const THEMES: Record<CardTheme, { bg: string; text: string; quote: string; aux: string; line: string }> = {
  light: { bg: '#FFFFFF', text: '#1F2937', quote: '#0FDC78', aux: '#9CA3AF', line: '#E5E7EB' },
  dark: { bg: '#18181B', text: '#F4F4F5', quote: '#32F08C', aux: '#71717A', line: '#3F3F46' },
  blue: { bg: '#EFF6FF', text: '#1E3A5F', quote: '#2563EB', aux: '#93A3B8', line: '#BFDBFE' },
  orange: { bg: '#FFF7ED', text: '#44403C', quote: '#EA580C', aux: '#A8A29E', line: '#FED7AA' },
  green: { bg: '#F0FDF4', text: '#1F2937', quote: '#16A34A', aux: '#8FA79B', line: '#BBF7D0' },
  // 自定义样式的默认值（首次切到自定义时等同浅色，之后由用户逐项改）
  custom: { bg: '#FFFFFF', text: '#1F2937', quote: '#0FDC78', aux: '#9CA3AF', line: '#E5E7EB' },
};

// 字体选项（流量优先：unicode-range 切片按需加载，固定版本号 URL 浏览器缓存 1 年，均免费商用）：
// - 默认：系统字体零流量
// - 黑体：MiSans（小米手机系统字体，等线风格的现代轻黑，官方免费商用；npm misans 包切片版，
//   在 npmmirror files API 白名单内，国内 CDN 优先）。Regular(400) + Semibold(650) 双字重，加粗用真 Semibold
// - 宋体：思源宋体（Noto Serif SC，SIL OFL）Regular 单字重；部分 WebView（如 iPhone Chrome）拿不到系统宋体，
//   由切片 webfont 兜底并保证各端一致；@fontsource 包在 npmmirror 白名单内
// - 楷体：霞鹜文楷 Light（300，OFL）。此前用屏显版（Medium 基准）观感偏重，Light 同源字形更轻盈；
//   官方 lxgw-wenkai-webfont 包在 npmmirror 白名单内
// - 手写：小赖字体 Xiaolai SC（OFL，濑户字体简体中文改良版）单字重；官方 @chinese-fonts/xiaolai 包在 npmmirror 白名单内
// 多镜像按序尝试：npmmirror（国内阿里）→ fastly.jsdelivr → cdn.jsdelivr
type CssSource = string[]; // 同一份 CSS 的多个镜像地址
type WebFont = { family: string; css: CssSource[] };
const NPMMIRROR = 'https://registry.npmmirror.com';
const FASTLY = 'https://fastly.jsdelivr.net/npm';
const JSDCdn = 'https://cdn.jsdelivr.net/npm';
const FONT_OPTS: Record<string, { label: string; stack: string; web?: WebFont }> = {
  default: { label: '默认', stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" },
  hei: {
    label: '黑体',
    stack: "'MiSans', SimHei, 'Heiti SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    web: {
      family: 'MiSans',
      css: [
        [`${NPMMIRROR}/misans/5.0.0/files/lib/Normal/MiSans-Regular.min.css`, `${FASTLY}/misans@5.0.0/lib/Normal/MiSans-Regular.min.css`, `${JSDCdn}/misans@5.0.0/lib/Normal/MiSans-Regular.min.css`],
        [`${NPMMIRROR}/misans/5.0.0/files/lib/Normal/MiSans-Semibold.min.css`, `${FASTLY}/misans@5.0.0/lib/Normal/MiSans-Semibold.min.css`, `${JSDCdn}/misans@5.0.0/lib/Normal/MiSans-Semibold.min.css`],
      ],
    },
  },
  song: {
    label: '宋体',
    stack: '"Noto Serif SC", Georgia, \'Songti SC\', SimSun, serif',
    web: {
      family: 'Noto Serif SC',
      css: [
        [`${NPMMIRROR}/@fontsource/noto-serif-sc/5.3.1/files/400.css`, `${FASTLY}/@fontsource/noto-serif-sc@5.3.1/400.css`],
      ],
    },
  },
  kai: {
    label: '楷体',
    stack: '"LXGW WenKai", \'Kaiti SC\', KaiTi, STKaiti, cursive, serif',
    web: {
      family: 'LXGW WenKai',
      css: [
        [`${NPMMIRROR}/lxgw-wenkai-webfont/1.7.0/files/lxgwwenkai-light.css`, `${FASTLY}/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-light.css`],
      ],
    },
  },
  hand: {
    label: '手写',
    stack: '"Xiaolai SC", \'Kaiti SC\', KaiTi, STKaiti, cursive, serif',
    web: {
      family: 'Xiaolai SC',
      css: [
        [`${NPMMIRROR}/@chinese-fonts/xiaolai/3.0.0/files/dist/Xiaolai/result.css`, `${FASTLY}/@chinese-fonts/xiaolai@3.0.0/dist/Xiaolai/result.css`],
      ],
    },
  },
};

// 边距选项（粗略四档）
const PAD_OPTS: Record<string, { label: string; value: number }> = {
  compact: { label: '紧凑', value: 16 },
  standard: { label: '标准', value: 24 },
  loose: { label: '宽松', value: 32 },
  xl: { label: '非常宽松', value: 40 },
};

// 底部日期/署名/水印固定用默认字体，不随消息字体加粗/字体选择变化
const BASE_FONT = FONT_OPTS.default.stack;

// ---------- 网络字体：仅选中宋体/楷体/手写时加载；镜像按序尝试；固定版本号 URL 浏览器缓存 1 年 ----------
const fontLinkInjected = new Set<string>(); // 本会话已挂过 <link> 的字体 key
const cssCache = new Map<string, { ok: boolean; text?: string }>(); // 每个 CSS 镜像 URL 的抓取结果（失败也标记，会话内不重试死源）
const fontBinCache = new Map<string, { ok: boolean; b64?: string }>(); // woff2 URL -> base64

// 预览渲染用：按镜像顺序挂 <link>，onerror 自动切下一个镜像
function injectWebfontLinks(fontKey: string) {
  const web = FONT_OPTS[fontKey]?.web;
  if (!web || fontLinkInjected.has(fontKey)) return;
  fontLinkInjected.add(fontKey);
  for (const sources of web.css) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    let i = 0;
    link.href = sources[0];
    link.onerror = () => {
      i += 1;
      if (i < sources.length) link.href = sources[i];
    };
    document.head.appendChild(link);
  }
}

async function fetchCss(sources: CssSource): Promise<{ text: string; base: string }> {
  for (const url of sources) {
    const hit = cssCache.get(url);
    if (hit) {
      if (hit.ok) return { text: hit.text!, base: url };
      continue; // 本会话已确认失败的镜像，跳过
    }
    try {
      const res = await fetch(url);
      if (!res.ok) {
        cssCache.set(url, { ok: false });
        continue;
      }
      const text = await res.text();
      cssCache.set(url, { ok: true, text });
      return { text, base: url };
    } catch {
      cssCache.set(url, { ok: false });
    }
  }
  throw new Error('字体样式加载失败');
}

async function fetchFontBin(url: string): Promise<string> {
  const hit = fontBinCache.get(url);
  if (hit) {
    if (hit.ok) return hit.b64!;
    throw new Error('字体文件加载失败');
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const b64 = btoa(bin);
    fontBinCache.set(url, { ok: true, b64 });
    return b64;
  } catch {
    fontBinCache.set(url, { ok: false });
    throw new Error('字体文件加载失败');
  }
}

// unicode-range（含 U+5A?? 通配写法）是否覆盖任一所需码点
function rangeCovers(range: string, cps: number[]): boolean {
  return range.split(',').some((part) => {
    const p = part.trim().replace(/^U\+/i, '');
    if (!p) return false;
    const [a, b] = p.split('-');
    const min = parseInt(a.replace(/\?/g, '0'), 16);
    const max = a.includes('?') ? parseInt(a.replace(/\?/g, 'F'), 16) : parseInt(b ?? a, 16);
    return cps.some((c) => c >= min && c <= max);
  });
}

// 组装 fontEmbedCSS：只嵌入正文命中的分片（整包 10MB+ 不可接受）；无精确字重时按最接近字重嵌入（与浏览器匹配规则一致）
async function buildFontEmbedCss(web: WebFont, content: string, bold: boolean): Promise<string> {
  const cps: number[] = [];
  for (const ch of content) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) cps.push(cp);
  }
  const need = bold ? '700' : '400';
  const candidates: { block: string; weight: string; url: string; base: string }[] = [];
  for (const sources of web.css) {
    let text: string, base: string;
    try {
      ({ text, base } = await fetchCss(sources));
    } catch {
      continue; // 该 CSS 的所有镜像都不可用，跳过
    }
    const blocks = text.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    for (const block of blocks) {
      if (!block.includes(web.family)) continue;
      const weight = (block.match(/font-weight:\s*([^;}]+)[;}]/)?.[1] ?? '400').trim().split(/\s+/)[0];
      const ur = block.match(/unicode-range:\s*([^;}]+)[;}]/)?.[1];
      if (ur && !rangeCovers(ur, cps)) continue;
      const url = block.match(/url\((['"]?)([^'")]+)\1\)/)?.[2];
      if (!url) continue;
      candidates.push({ block, weight, url, base });
    }
  }
  let picked = candidates.filter((c) => c.weight === need);
  if (picked.length === 0 && candidates.length > 0) {
    // 无精确字重分片（如霞鹜 Light=300、MiSans Semibold=650）：按最接近所需字重选分片，
    // 与浏览器的字重匹配规则一致，保证导出 PNG 与预览用同一档字重
    const w = (s: string) => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : 400;
    };
    const target = w(need);
    const dist = (c: { weight: string }) => Math.abs(w(c.weight) - target);
    const best = Math.min(...candidates.map(dist));
    picked = candidates.filter((c) => dist(c) === best);
  }
  const out: string[] = [];
  for (const c of picked) {
    try {
      const abs = /^https?:\/\//i.test(c.url) ? c.url : new URL(c.url, c.base).href;
      const b64 = await fetchFontBin(abs);
      out.push(c.block.replace(/url\((['"]?)[^'")]+\1\)/, `url(data:font/woff2;base64,${b64})`));
    } catch {
      // 单个分片失败就跳过，对应字符回落回退字体
    }
  }
  return out.join('\n');
}

const FONT_MIN = 12;
const FONT_MAX = 24;
// 标题字号独立可调范围（与正文字号解耦）
const TITLE_MIN = 12;
const TITLE_MAX = 48;
// 日期/署名字号范围（未设置时跟随正文联动值）
const AUX_MIN = 10;
const AUX_MAX = 24;
// 卡片文字常用颜色（标题/正文共用；另提供取色器自定义）
const CARD_COLORS = ['#000000', '#FFFFFF', '#6B7280', '#DC2626', '#EA580C', '#16A34A', '#2563EB'];
// 自定义样式的可调颜色字段（与 THEMES 的 bg/text/aux/quote/line 一一对应）
const CUSTOM_FIELDS = ['customBg', 'customText', 'customAux', 'customQuote', 'customLine'] as const;
// 判断颜色是否偏浅：浅色底上用深色勾，深色底上用白色勾
const isLightColor = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

// 外观设置持久化在浏览器本地（跨会话记忆，仅本设备生效）
const STYLE_KEY = 'smallchat-card-style';
// 常用签名/标题最多保存个数
const MAX_SIGNATURES = 6;
const MAX_TITLES = 6;
// 日期显示位置：四个角（左下角为默认；左上/右下不常用但一并支持）
type DatePos = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
// 标题对齐：居中（默认）/ 左对齐（左侧改用主题色竖线替代双引号）
type TitleAlign = 'center' | 'left';
const loadStyle = (): {
  theme: CardTheme;
  fontSize: number;
  fontKey: string;
  padKey: string;
  bold: boolean;
  showDate: boolean; // 卡片是否显示日期行
  showSignature: boolean; // 卡片是否显示署名行
  showNickname: boolean; // 多消息卡片是否显示每条的发送者昵称
  showQuote: boolean; // 卡片是否显示顶部装饰双引号
  showTitle: boolean; // 卡片是否显示顶部标题
  datePos: DatePos; // 日期显示位置
  titleAlign: TitleAlign; // 标题对齐方式
  titleSize: number; // 标题字号（与正文字号解耦）
  titleColor?: string; // 标题颜色（#RRGGBB）；缺省按卡片底色自动取黑/白
  bodyColor?: string; // 正文字色（#RRGGBB）；缺省表示跟随主题
  dateSize?: number; // 日期字号；缺省跟随正文联动
  dateColor?: string; // 日期颜色；缺省跟随主题
  sigSize?: number; // 署名字号；缺省跟随正文联动
  sigColor?: string; // 署名颜色；缺省跟随主题
  customBg?: string; // 自定义样式的 5 个颜色（theme = custom 时生效）
  customText?: string;
  customAux?: string;
  customQuote?: string;
  customLine?: string;
  bgOverride?: string; // 「修改配色」只改背景/强调色：覆盖当前样式的底色（自定义样式下改的是 customBg）
  accentOverride?: string; // 覆盖当前样式的强调色（双引号/竖线/署名小方块）
  signature?: string;
  signatures?: string[]; // 常用签名列表（最多 MAX_SIGNATURES 个）
  title?: string; // 卡片标题（顶部居中，与双引号同行同字号同色）
  titles?: string[]; // 常用标题列表（最多 MAX_TITLES 个）
} => {
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const fs = Number(s.fontSize);
      if (FONT_OPTS[s.fontKey] && PAD_OPTS[s.padKey] && fs >= FONT_MIN && fs <= FONT_MAX) {
        const theme: CardTheme = THEMES[s.theme as CardTheme] ? (s.theme as CardTheme) : 'light';
        // 兼容三档字重实验期的 weight 字段：600/700 都归为加粗
        const bold = s.bold === true || Number(s.weight) >= 600;
        // signature/title 缺省（老数据没有这个字段）时返回 undefined，由调用方决定是否迁移/按空处理
        const signature = typeof s.signature === 'string' ? s.signature : undefined;
        const title = typeof s.title === 'string' ? s.title : undefined;
        // 常用签名/标题列表：老数据没有该字段时返回 undefined（由调用方用当前值做迁移）
        const signatures = Array.isArray(s.signatures)
          ? s.signatures.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_SIGNATURES)
          : undefined;
        const titles = Array.isArray(s.titles)
          ? s.titles.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_TITLES)
          : undefined;
        // 日期位置：老数据 'bottom'/'top' 分别迁移到左下角/右上角，缺省默认左下角
        const datePos: DatePos =
          s.datePos === 'top' || s.datePos === 'top-right'
            ? 'top-right'
            : s.datePos === 'top-left'
              ? 'top-left'
              : s.datePos === 'bottom-right'
                ? 'bottom-right'
                : 'bottom-left';
        // 标题对齐：缺省居中
        const titleAlign: TitleAlign = s.titleAlign === 'left' ? 'left' : 'center';
        // 标题字号/颜色：与正文解耦；老数据按「正文×1.6（上限32）」和主题色迁移，保证观感不变
        const titleSize = Number.isInteger(s.titleSize) && s.titleSize >= TITLE_MIN && s.titleSize <= TITLE_MAX
          ? s.titleSize
          : Math.min(Math.round(fs * 1.6), 32);
        const titleColor = typeof s.titleColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.titleColor)
          ? s.titleColor
          : undefined;
        // 正文字色：无值=跟随主题（老数据自然走默认）
        const bodyColor = typeof s.bodyColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.bodyColor)
          ? s.bodyColor
          : undefined;
        // 日期/署名的字号与颜色：无值=跟随正文联动字号 / 主题辅助色
        const auxSizeField = (v: unknown) =>
          Number.isInteger(v) && (v as number) >= AUX_MIN && (v as number) <= AUX_MAX ? (v as number) : undefined;
        const auxColorField = (v: unknown) =>
          typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
        // showDate/showSignature/showNickname/showQuote/showTitle 缺省（老数据没有这个字段）时默认显示
        return {
          theme,
          fontSize: fs,
          fontKey: s.fontKey,
          padKey: s.padKey,
          bold,
          showDate: s.showDate !== false,
          showSignature: s.showSignature !== false,
          showNickname: s.showNickname !== false,
          showQuote: s.showQuote !== false,
          showTitle: s.showTitle !== false,
          datePos,
          titleAlign,
          titleSize,
          titleColor,
          bodyColor,
          dateSize: auxSizeField(s.dateSize),
          dateColor: auxColorField(s.dateColor),
          sigSize: auxSizeField(s.sigSize),
          sigColor: auxColorField(s.sigColor),
          customBg: auxColorField(s.customBg),
          customText: auxColorField(s.customText),
          customAux: auxColorField(s.customAux),
          customQuote: auxColorField(s.customQuote),
          customLine: auxColorField(s.customLine),
          bgOverride: auxColorField(s.bgOverride),
          accentOverride: auxColorField(s.accentOverride),
          signature,
          signatures,
          title,
          titles,
        };
      }
    }
  } catch {
    // 损坏数据按默认处理
  }
  return { theme: 'light', fontSize: 16, fontKey: 'default', padKey: 'standard', bold: false, showDate: true, showSignature: true, showNickname: true, showQuote: true, showTitle: true, datePos: 'bottom-left', titleAlign: 'center', titleSize: 26 };
};

const isMobile = () => /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

// 「修改文本」小弹窗的目标字段（nick 仅多消息卡片出现）
type TextEditTarget = 'sig' | 'date' | 'title' | 'body' | 'nick' | 'color';
const TEXT_EDIT_TITLES: Record<TextEditTarget, string> = {
  sig: '修改署名',
  date: '修改日期',
  title: '修改标题',
  body: '修改正文',
  nick: '修改昵称',
  color: '修改配色',
};

// 自动高度文本框：随内容撑高——长段落没有换行符时按行数估算不准，直接量 scrollHeight 才可靠；
// 封顶约半屏，超出框内滚动。定义在 ShareCardModal 外：组件内定义会导致每次渲染都是新组件类型，输入中被卸载重建、丢焦点
const AutoTextarea = ({
  value,
  onChange,
  className,
  autoFocus,
  placeholder,
  style,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.5))}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={3}
      autoFocus={autoFocus}
      placeholder={placeholder}
      className={className}
      style={style}
    />
  );
};

export const ShareCardModal = ({ messages, cardSignature, isDarkMode, onClose }: Props) => {
  const [theme, setTheme] = useState<CardTheme>(() => loadStyle().theme);
  const [style, setStyle] = useState(() => {
    const s = loadStyle();
    delete s.signature; // 签名单独管，不混在样式选项里
    delete s.signatures; // 常用签名列表单独管
    delete s.title; // 标题单独管，不混在样式选项里
    delete s.titles; // 常用标题列表单独管
    return s;
  });
  // 卡片签名仅存浏览器：本地没有时以服务器值（cardSignature prop）为初始值做一次性迁移，老用户无感；留空则卡片不显示署名
  const [signature, setSignature] = useState<string>(() => loadStyle().signature ?? cardSignature);
  // 常用签名列表（仅存浏览器本地，最多 MAX_SIGNATURES 个）：老数据用当前签名/服务器签名做一次性迁移
  const [signatures, setSignatures] = useState<string[]>(() => {
    const s = loadStyle();
    if (s.signatures && s.signatures.length > 0) return s.signatures.slice(0, MAX_SIGNATURES);
    const seed = (s.signature ?? cardSignature ?? '').trim();
    return seed ? [seed] : [];
  });
  // 卡片标题仅存浏览器（与署名同模式），顶部居中显示；留空则不显示
  const [title, setTitle] = useState<string>(() => loadStyle().title ?? '');
  // 常用标题列表（仅存浏览器本地，最多 MAX_TITLES 个）：老数据用当前标题做一次性迁移
  const [titles, setTitles] = useState<string[]>(() => {
    const s = loadStyle();
    if (s.titles && s.titles.length > 0) return s.titles.slice(0, MAX_TITLES);
    const seed = (s.title ?? '').trim();
    return seed ? [seed] : [];
  });
  // 「修改文本」独立小弹窗：当前打开哪一个（null=都不开）
  const [textEdit, setTextEdit] = useState<TextEditTarget | null>(null);
  // 日期覆写：仅本次打开生效（进 localStorage 会串到别的消息的卡片上），留空用消息默认日期
  const [dateOverride, setDateOverride] = useState('');
  // 正文覆写（msgId -> 修改后文字）：仅本次打开生效，用于改标点/换行/错别字，不动服务器原消息
  const [contentEdits, setContentEdits] = useState<Record<number, string>>({});
  // 昵称覆写（原昵称 -> 显示昵称）：仅本次打开生效，多消息卡片制作时临时缩短/隐藏昵称，不改群资料
  const [nickEdits, setNickEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imgUrl, setImgUrl] = useState(''); // 移动端生成结果（长按保存）
  const [copied, setCopied] = useState(false); // 复制文字成功后的短暂轻提示
  // 图片消息内容（msgId -> dataURL）： uploads 是跨域静态资源，先 fetch 成 dataURL 再渲染，
  // 保证 html-to-image 导出时画布不被跨域图片污染；加载完成前显示占位块
  const [imgMap, setImgMap] = useState<Record<number, string>>({});
  const cardRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  // 自定义样式：以 custom 默认色为底，逐项用用户设置覆盖
  // 非自定义样式也可在「修改配色」里只覆盖背景/强调色，其余颜色仍走样式预设
  const t =
    theme === 'custom'
      ? {
          bg: style.customBg ?? THEMES.custom.bg,
          text: style.customText ?? THEMES.custom.text,
          quote: style.customQuote ?? THEMES.custom.quote,
          aux: style.customAux ?? THEMES.custom.aux,
          line: style.customLine ?? THEMES.custom.line,
        }
      : {
          ...THEMES[theme],
          bg: style.bgOverride ?? THEMES[theme].bg,
          quote: style.accentOverride ?? THEMES[theme].quote,
        };
  // 标题颜色默认值：按卡片底色明暗自动取黑/白（自定义深底色也能看清）
  const titleColorHex = style.titleColor ?? (isLightColor(t.bg) ? '#000000' : '#F5F5F5');
  const font = FONT_OPTS[style.fontKey].stack;
  const padding = PAD_OPTS[style.padKey].value;
  // 「修改正文」编辑框所见即所得：编辑框本体即白色卡片——宽度 = 白色卡片宽度（预览灰框 380 − 灰色内边距 24 = 356），
  // 内边距 = 卡片边距档位；borderWidth 0 去掉输入框自带边框，外形与白卡完全重合，文字区宽度随之精确一致；
  // 字体/字号/加粗/行距也与卡片正文一致（字体不同则每行容纳字符数不同）；窄屏 maxWidth 兜底
  const bodyTaStyle: React.CSSProperties = {
    fontFamily: font,
    fontSize: style.fontSize,
    fontWeight: style.bold ? 700 : 400,
    lineHeight: 1.8,
    padding,
    width: 356,
    maxWidth: '100%',
    borderWidth: 0,
    wordBreak: 'break-all', // 与卡片正文 break-all 同规则，标点/单词断行位置一致
  };
  // 编辑框外的灰色衬底：与卡片预览灰框完全同款同行为（w-[380px] max-w-full p-3），弹窗里复刻「灰框包白卡」结构；
  // 手机上预览灰框会收缩到弹窗宽度，编辑框灰框必须同样收缩（不能用随内容定宽的 inline-flex，
  // 否则装不下 356px 时灰框溢出、宽度与预览灰框不一致），编辑框 maxWidth:100% 随灰框同步缩放
  const bodyTaFrameCls = `w-[380px] max-w-full p-3 rounded-xl ${isDarkMode ? 'bg-gray-900' : 'bg-gray-200'}`;
  const isMulti = messages.length > 1;
  const date = messages[0].created_at.slice(0, 10);
  const lastDate = messages[messages.length - 1].created_at.slice(0, 10);
  // 跨天的多消息卡片显示日期区间；「修改文本」里改过日期则以覆写为准
  const defaultDateLabel = date === lastDate ? date : `${date} ~ ${lastDate}`;
  const dateLabel = dateOverride.trim() || defaultDateLabel;
  const fileName = `smallChat-card-${date.replace(/-/g, '')}.png`;
  // 卡片正文以「修改文本」里的覆写为准（未改的消息用原文）
  const contentOf = (m: ChatMessage) => contentEdits[m.id] ?? m.content;
  // 昵称以「修改昵称」里的覆写为准（未改的用原昵称）；仅多消息卡片用
  const nickOf = (m: ChatMessage) => nickEdits[m.nickname] ?? m.nickname;
  // 全部文字内容（字体分片内嵌、复制文字共用）
  const fullText = messages.map(contentOf).join('\n');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // 修改文本小弹窗开着时，Esc 只关它，不连带关整个卡片弹窗
      if (textEdit) setTextEdit(null);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(copyTimer.current);
    };
  }, [onClose, textEdit]);

  // 选中（或恢复已保存的）webfont 字体时挂样式表，浏览器按 unicode-range 只下载用到的分片
  useEffect(() => {
    if (FONT_OPTS[style.fontKey]?.web) injectWebfontLinks(style.fontKey);
  }, [style.fontKey]);

  // 图片消息预载为 dataURL（并行，单张失败不阻塞其他图）。
  // 走 api.php 图片代理：uploads 静态目录没有 CORS 头，跨域 fetch 会被浏览器拦截（一直停在"加载中"）；
  // api.php 响应带 CORS 头。token 走 query 参数（景安 WAF 拦 OPTIONS 预检，不能带自定义请求头）
  useEffect(() => {
    let cancelled = false;
    const jobs = messages
      .filter((m) => m.type === 'image' && m.file)
      .map(async (m) => {
        try {
          const token = tokenStore.get();
          const url = `${API_BASE}/api.php?action=file.proxy&message_id=${m.id}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
          const res = await fetch(url);
          if (!res.ok) return;
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result as string);
            fr.onerror = () => reject(new Error('read fail'));
            fr.readAsDataURL(blob);
          });
          if (!cancelled) setImgMap((prev) => ({ ...prev, [m.id]: dataUrl }));
        } catch {
          // 单张图片加载失败：卡片上保留占位块，不影响其他内容
        }
      });
    void Promise.all(jobs);
    return () => {
      cancelled = true;
    };
  }, [messages]);

  // 外观设置（含卡片样式主题、签名、标题）写入浏览器本地
  useEffect(() => {
    try {
      localStorage.setItem(STYLE_KEY, JSON.stringify({ ...style, theme, signature, signatures, title, titles }));
    } catch {
      // 存储不可用时忽略（无痕模式等）
    }
  }, [style, theme, signature, signatures, title, titles]);

  // 外观/文本变化后，之前生成的图片作废
  useEffect(() => setImgUrl(''), [theme, style, signature, title, dateOverride, contentEdits, nickEdits]);

  const save = async () => {
    if (!cardRef.current) return;
    setError('');
    setBusy(true);
    try {
      // webfont 字体：先确保预览字体就绪，再只嵌入正文命中的分片进图片（PNG 内嵌字体，任何设备显示一致）
      const web = FONT_OPTS[style.fontKey].web;
      let fontEmbedCss = '';
      if (web) {
        try {
          await document.fonts.load(`${style.bold ? 700 : 400} ${style.fontSize}px "${web.family}"`, fullText);
          fontEmbedCss = await buildFontEmbedCss(web, fullText, style.bold);
        } catch {
          // 网络字体加载失败：退回回退字体渲染，不阻断生成
        }
      }
      // skipFonts：跳过 html-to-image 默认的全文档字体扫描内嵌（它会把 Tailwind 等所有 CSS 里的字体都抓一遍，非常慢）；
      // 系统字体无需内嵌，宋体/楷体/手写由上面的 fontEmbedCss 精确嵌入，两者互不影响
      const url = await toPng(cardRef.current, { pixelRatio: 2, fontEmbedCSS: fontEmbedCss, skipFonts: true });
      if (isMobile()) {
        // 移动端 a[download] 不可靠：在弹窗内展示图片，引导长按保存
        setImgUrl(url);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
      }
    } catch {
      setError('生成失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  // 复制正文到剪贴板（发朋友圈时配文用）；成功按钮短暂变「已复制」，不用弹窗打断
  // 多消息卡片复制为「昵称：内容」逐行文本（与合并复制格式一致）；文字以「修改文本」覆写为准
  const copyPayload = isMulti
    ? messages
        .map((m) => {
          const body =
            m.type === 'image' ? '[图片]' : m.type === 'file' ? `[文件] ${m.file?.name ?? ''}` : contentOf(m);
          return `${nickOf(m)}：${body}`;
        })
        .join('\n')
    : contentOf(messages[0]);
  const copyText = async () => {
    const done = () => {
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    };
    try {
      await navigator.clipboard.writeText(copyPayload);
      done();
    } catch {
      // 剪贴板 API 不可用时退回 textarea 方案
      const ta = document.createElement('textarea');
      ta.value = copyPayload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch {
        setError('复制失败，请手动选择文字复制');
      }
      document.body.removeChild(ta);
    }
  };

  // 系统分享（仅支持 Web Share Level 2 的设备显示入口）
  const share = async () => {
    if (!imgUrl) return;
    try {
      const blob = await (await fetch(imgUrl)).blob();
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      }
    } catch {
      // 用户取消或设备不支持，忽略
    }
  };

  // 通用小选项按钮（样式/字体/边距共用）
  const optBtn = (active: boolean, onClick: () => void, label: string) => (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-sm rounded-lg transition-colors ${
        active
          ? 'bg-green-500 text-white'
          : isDarkMode
            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  // 设置行：左侧标签 + 右侧控件可换行，控件间留间距
  const settingRow = (label: string, children: React.ReactNode) => (
    <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1.5">
      <span className={`w-10 flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        {label}
      </span>
      {children}
    </div>
  );

  // 开关式小按钮（日期/署名显示开关用，配色与选项按钮一致，字号统一 14px）
  const toggleBtn = (active: boolean, onClick: () => void, label: string) => (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-sm rounded-lg transition-colors ${
        active
          ? 'bg-green-500 text-white'
          : isDarkMode
            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  const auxSize = Math.max(12, Math.round(style.fontSize * 0.8)); // 昵称/文件说明随正文字号联动
  // 「恢复默认」图标按钮（字号/颜色等被改乱后一键复位）
  const resetBtn = (isDefault: boolean, onClick: () => void, label: string, extraCls = '') => (
    <button
      onClick={onClick}
      disabled={isDefault}
      title={label}
      aria-label={label}
      className={`${extraCls} w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg ${
        isDefault
          ? isDarkMode
            ? 'text-gray-600 cursor-default'
            : 'text-gray-300 cursor-default'
          : isDarkMode
            ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
      }`}
    >
      <RotateCcw className="w-4 h-4" />
    </button>
  );

  // 一键复位「配色/标题/正文/日期/署名」的用户设置（只动有默认值的样式项，不动标题/署名文字内容）
  const resetUserSettings = () => {
    const ok = window.confirm(
      '确定把配色、标题、正文、日期、署名的样式设置恢复默认吗？\n（含字号、文字颜色、背景/强调色、标题对齐、日期位置等；不会清空标题和署名文字）',
    );
    if (!ok) return;
    setStyle((s) => ({
      ...s,
      fontSize: 16,
      bold: false,
      titleSize: 26,
      titleColor: undefined,
      titleAlign: 'center',
      bodyColor: undefined,
      dateSize: undefined,
      dateColor: undefined,
      datePos: 'bottom-left',
      sigSize: undefined,
      sigColor: undefined,
      bgOverride: undefined,
      accentOverride: undefined,
      customBg: undefined,
      customText: undefined,
      customAux: undefined,
      customQuote: undefined,
      customLine: undefined,
    }));
  };
  // 日期、署名：可在各自弹窗独立设置字号/颜色，未设置时跟随正文联动值与主题色
  const dateFontSize = style.dateSize ?? auxSize;
  const dateColorHex = style.dateColor ?? t.aux;
  const sigFontSize = style.sigSize ?? auxSize;
  const sigColorHex = style.sigColor ?? t.aux;

  // 日期四个角：左上/右上与引号、标题同一行；左上角额外让出一行，避免盖住大引号
  const dateTopLeft = style.showDate && style.datePos === 'top-left';
  const dateTopRight = style.showDate && style.datePos === 'top-right';
  const dateBottomLeft = style.showDate && style.datePos === 'bottom-left';
  const dateBottomRight = style.showDate && style.datePos === 'bottom-right';
  const titleTopOffset = dateTopLeft ? Math.round(dateFontSize * 1.4) : 0;
  // 标题左对齐时，左侧双引号让位给主题色竖线（无标题时仍按「显示双引号」开关走）
  const titleLeft = style.titleAlign === 'left';
  const showTopQuote = style.showQuote && !(titleLeft && title.trim() !== '');

  // 署名+小方块 baseline 对齐：空 inline-block 的 baseline 即其底边，方块底正好落在文字基线上（中文字形底≈基线），任何字号下视觉都是"与文字底对齐"
  const signatureNode = style.showSignature ? (
    <span className="flex items-baseline" style={{ color: sigColorHex, fontSize: sigFontSize }}>
      {signature}
      <span
        style={{
          width: 8,
          height: 8,
          backgroundColor: t.quote,
          borderRadius: 2,
          display: 'inline-block',
          marginLeft: 6,
          flexShrink: 0,
        }}
      />
    </span>
  ) : null;

  // 日期文本节点：字号/颜色可在「修改日期」里独立设置
  const dateNode = (
    <span style={{ color: dateColorHex, fontSize: dateFontSize, whiteSpace: 'nowrap' }}>{dateLabel}</span>
  );

  // 「修改文本」入口按钮（署名/日期/标题/正文/昵称共用样式，每个打开自己的小弹窗）
  const textEditBtn = (target: TextEditTarget, label: string) => (
    <button
      key={target}
      onClick={() => setTextEdit(target)}
      className={`px-2 py-0.5 text-sm rounded-lg transition-colors ${
        isDarkMode
          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  // ---------- 「修改文本」弹窗共用 ----------
  const editInputCls = `w-full px-2.5 py-1.5 text-sm rounded-lg border outline-none focus:ring-2 focus:ring-green-500 ${
    isDarkMode
      ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
      : 'bg-white border-gray-300 text-gray-700 placeholder-gray-400'
  }`;
  // 输入框清空按钮：框内有文字时才出现，点一下清空
  const clearBtn = (value: string, onClear: () => void) =>
    value ? (
      <button
        onClick={onClear}
        title="清空"
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded ${
          isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
        }`}
      >
        <X className="w-4 h-4" />
      </button>
    ) : null;

  // 字段标签行：左侧字段名，右侧「还原」（仅在有覆写时出现，单独恢复默认）
  const editLabelRow = (label: string, overridden: boolean, onReset: () => void) => (
    <div className="flex items-center justify-between mb-1">
      <span className={`min-w-0 truncate text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`} title={label}>
        {label}
      </span>
      {overridden && (
        <button
          onClick={onReset}
          className={`text-xs ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
        >
          还原
        </button>
      )}
    </div>
  );

  // 颜色选择行（标题/正文/背景/强调色共用）：可选「默认」，预设色圆点，末尾矩形取色器
  // defaultColor 仅用于取色器按钮上的当前色预览（如背景色的主题默认值）
  const swatchRow = (
    current: string | undefined,
    onChange: (color?: string) => void,
    withDefault: boolean,
    defaultColor?: string,
  ) => {
    const isPreset = !!current && CARD_COLORS.some((c) => c.toLowerCase() === current.toLowerCase());
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {withDefault && (
          <button
            onClick={() => onChange(undefined)}
            className={`h-7 px-2 text-sm rounded-full border ${
              !current
                ? 'border-green-500 text-green-600'
                : isDarkMode
                  ? 'border-gray-500 text-gray-300 hover:bg-gray-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            默认
          </button>
        )}
        {CARD_COLORS.map((c) => {
          const selected = !!current && current.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              onClick={() => onChange(c)}
              title={c}
              aria-label={`颜色 ${c}`}
              // 用实心 2px 边框代替 ring/box-shadow：阴影类边缘会二次抗锯齿、看起来发虚
              className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center border-2 ${
                selected ? 'border-green-500' : isDarkMode ? 'border-gray-500' : 'border-gray-300'
              }`}
              style={{ backgroundColor: c }}
            >
              {selected && (
                <Check className="w-3.5 h-3.5" strokeWidth={3} style={{ color: isLightColor(c) ? '#374151' : '#FFFFFF' }} />
              )}
            </button>
          );
        })}
        {/* 自定义颜色：矩形按钮 + 取色器图标 + 当前颜色小方块，避免被误认成颜色圆点 */}
        <label
          title="自定义颜色"
          className={`ml-1 flex items-center gap-1 h-7 px-2 rounded-md border text-sm cursor-pointer ${
            current && !isPreset
              ? 'border-green-500 text-green-600'
              : isDarkMode
                ? 'border-gray-500 text-gray-300 hover:bg-gray-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Pipette className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="whitespace-nowrap">自定义</span>
          <span
            className={`w-3 h-3 rounded-sm border flex-shrink-0 ${isDarkMode ? 'border-gray-500' : 'border-gray-300'}`}
            style={{ backgroundColor: current ?? defaultColor ?? t.text }}
          />
          <input
            type="color"
            value={current ?? '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="w-0 h-0 opacity-0"
          />
        </label>
      </div>
    );
  };
  // 可选颜色字段：选「默认」时删掉字段，回到主题色
  const setOptionalColor = (key: 'dateColor' | 'sigColor' | 'bodyColor', color?: string) =>
    setStyle((s) => {
      const next = { ...s };
      if (color) next[key] = color;
      else delete next[key];
      return next;
    });

  // 自定义样式颜色：传 undefined 表示恢复该字段默认
  const setCustomThemeColor = (field: (typeof CUSTOM_FIELDS)[number], color?: string) =>
    setStyle((s) => {
      const next = { ...s };
      next[field] = color;
      return next;
    });

  // 可选覆盖色（非自定义样式）：传 undefined 删除字段
  const setOverrideColor = (key: 'bgOverride' | 'accentOverride', color?: string) =>
    setStyle((s) => {
      const next = { ...s };
      next[key] = color;
      return next;
    });
  // 「修改配色」弹窗：自定义样式下直接改 custom 字段，其余样式写入 bg/accent 覆盖
  const colorEditBg = theme === 'custom' ? style.customBg : style.bgOverride;
  const colorEditAccent = theme === 'custom' ? style.customQuote : style.accentOverride;
  const setColorEditBg = (c?: string) =>
    theme === 'custom' ? setCustomThemeColor('customBg', c) : setOverrideColor('bgOverride', c);
  const setColorEditAccent = (c?: string) =>
    theme === 'custom' ? setCustomThemeColor('customQuote', c) : setOverrideColor('accentOverride', c);

  const setContentEdit = (id: number, value: string, original: string) =>
    setContentEdits((prev) => {
      const next = { ...prev };
      if (value === original) delete next[id]; // 改回原文则清除覆写，避免脏数据越攒越多
      else next[id] = value;
      return next;
    });
  const textMsgs = messages.filter((m) => m.type === 'text'); // 多消息卡片里仅文字消息可改正文
  // 「修改昵称」用：卡片里出现的去重昵称列表（保持消息中的出现顺序）
  const uniqueNicks = Array.from(new Set(messages.map((m) => m.nickname)));
  const setNickEdit = (orig: string, value: string) =>
    setNickEdits((prev) => {
      const next = { ...prev };
      if (value === orig) delete next[orig]; // 改回原昵称则清除覆写
      else next[orig] = value;
      return next;
    });

  // 常用签名：保存当前签名进列表（最多 MAX_SIGNATURES 个）；点列表项切换；× 删除
  const currentSig = signature.trim();
  const canSaveSig = currentSig !== '' && !signatures.includes(currentSig) && signatures.length < MAX_SIGNATURES;
  const addSignature = () => {
    if (!canSaveSig) return;
    setSignatures((prev) => [...prev, currentSig]);
  };
  const removeSignature = (name: string) => setSignatures((prev) => prev.filter((n) => n !== name));

  // 常用标题：与签名同一套交互（保存当前 / 点击切换 / × 删除），最多 MAX_TITLES 个
  const currentTitle = title.trim();
  const canSaveTitle = currentTitle !== '' && !titles.includes(currentTitle) && titles.length < MAX_TITLES;
  const addTitle = () => {
    if (!canSaveTitle) return;
    setTitles((prev) => [...prev, currentTitle]);
  };
  const removeTitle = (name: string) => setTitles((prev) => prev.filter((n) => n !== name));

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={onClose}>
        <div
          className={`rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
          onClick={(e) => e.stopPropagation()}
        >
        <div className={`flex items-center justify-between p-4 border-b flex-shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>生成分享卡片</h3>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3">
          {/* 外观设置：样式/字号/字体/边距（记在浏览器，不上传） */}
          <div className="space-y-2">
            {settingRow(
              '样式',
              <>
                {optBtn(theme === 'light', () => setTheme('light'), '浅色')}
                {optBtn(theme === 'dark', () => setTheme('dark'), '深色')}
                {optBtn(theme === 'blue', () => setTheme('blue'), '蓝')}
                {optBtn(theme === 'orange', () => setTheme('orange'), '橙')}
                {optBtn(theme === 'green', () => setTheme('green'), '绿')}
                {optBtn(theme === 'custom', () => setTheme('custom'), '自定义')}
              </>,
            )}
            {theme === 'custom' && (
              <div className={`rounded-lg border px-2 py-1.5 ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>自定义配色</span>
                  <button
                    onClick={() => CUSTOM_FIELDS.forEach((f) => setCustomThemeColor(f, undefined))}
                    className={`text-xs ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    恢复默认
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['customBg', '背景', 'bg'],
                      ['customText', '正文', 'text'],
                      ['customAux', '辅助文字', 'aux'],
                      ['customQuote', '强调色', 'quote'],
                      ['customLine', '分割线', 'line'],
                    ] as const
                  ).map(([field, label, key]) => {
                    const value = style[field] ?? THEMES.custom[key];
                    return (
                      <label
                        key={field}
                        title={`${label}颜色`}
                        className={`flex items-center gap-1.5 h-8 px-2 rounded-md border cursor-pointer ${
                          isDarkMode ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <span className={`flex-1 min-w-0 truncate text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
                        <span
                          className={`w-4 h-4 flex-shrink-0 rounded-sm border ${isDarkMode ? 'border-gray-500' : 'border-gray-300'}`}
                          style={{ backgroundColor: value }}
                        />
                        <span className={`text-xs tabular-nums ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{value.toUpperCase()}</span>
                        <input
                          type="color"
                          value={value}
                          onChange={(e) => setCustomThemeColor(field, e.target.value)}
                          className="w-0 h-0 opacity-0"
                        />
                      </label>
                    );
                  })}
                </div>
                <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  改这 5 个颜色即可复刻任意样式；文字颜色也可在「修改标题 / 正文 / 日期 / 署名」里单独设置
                </p>
              </div>
            )}
            {settingRow(
              '字号',
              <>
                <input
                  type="range"
                  min={FONT_MIN}
                  max={FONT_MAX}
                  value={style.fontSize}
                  onChange={(e) => setStyle((s) => ({ ...s, fontSize: Number(e.target.value) }))}
                  className="flex-1 min-w-[120px] accent-green-500"
                />
                <span className={`w-10 text-right text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{style.fontSize}px</span>
                {resetBtn(style.fontSize === 16, () => setStyle((s) => ({ ...s, fontSize: 16 })), '恢复默认字号 16px')}
                <button
                  onClick={() => setStyle((s) => ({ ...s, bold: !s.bold }))}
                  title="正文加粗"
                  className={`ml-auto w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors ${
                    style.bold
                      ? 'bg-green-500 text-white'
                      : isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Bold className="w-4 h-4" />
                </button>
              </>,
            )}
            {settingRow(
              '字体',
              <>
                {Object.entries(FONT_OPTS).map(([key, o]) =>
                  optBtn(style.fontKey === key, () => setStyle((s) => ({ ...s, fontKey: key })), o.label),
                )}
              </>,
            )}
            {settingRow(
              '边距',
              Object.entries(PAD_OPTS).map(([key, o]) =>
                optBtn(style.padKey === key, () => setStyle((s) => ({ ...s, padKey: key })), o.label),
              ),
            )}
            {/* 修改：配色/标题/正文/日期/署名/昵称（昵称仅多消息卡片）各自独立小弹窗，改哪项点哪项 */}
            {settingRow(
              '修改',
              <>
                {textEditBtn('color', '配色')}
                {textEditBtn('title', '标题')}
                {textEditBtn('body', '正文')}
                {textEditBtn('date', '日期')}
                {textEditBtn('sig', '署名')}
                {isMulti && textEditBtn('nick', '昵称')}
                {resetBtn(false, resetUserSettings, '复位配色/标题/正文/日期/署名的设置', 'ml-auto')}
              </>,
            )}
            {/* 日期/署名显示开关：控制卡片预览与导出图，默认都显示，记入浏览器本地 */}
            {settingRow(
              '显示',
              <>
                {toggleBtn(style.showQuote, () => setStyle((s) => ({ ...s, showQuote: !s.showQuote })), '双引号')}
                {toggleBtn(style.showTitle, () => setStyle((s) => ({ ...s, showTitle: !s.showTitle })), '标题')}
                {toggleBtn(style.showNickname, () => setStyle((s) => ({ ...s, showNickname: !s.showNickname })), '昵称')}
                {toggleBtn(style.showDate, () => setStyle((s) => ({ ...s, showDate: !s.showDate })), '日期')}
                {toggleBtn(style.showSignature, () => setStyle((s) => ({ ...s, showSignature: !s.showSignature })), '署名')}
              </>,
            )}
          </div>

          {/* 卡片预览：灰色底稿标出边界，卡片本身即最终输出图片的范围（生成后结果图覆盖在卡片上） */}
          <div className="flex justify-center">
            <div className={`w-[380px] max-w-full rounded-xl p-3 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-200'}`}>
              <div className="relative">
                {/* 卡片容器保持直角：圆角会让导出 PNG 四角透明，在微信里被渲染成黑色角；预览与导出一致（所见即所得） */}
                <div
                  ref={cardRef}
                  style={{ backgroundColor: t.bg, fontFamily: font, fontSize: style.fontSize, lineHeight: 1.8, padding }}
                >
                  {/* 顶部：装饰双引号（左）+ 标题（居中，与双引号同行；黑体，字号/颜色在「修改标题」里单独设置，与正文解耦）。
                      标题用绝对定位居中，不挤动双引号；标题显示时容器保底行高，避免双引号关闭后正文贴顶。
                      日期可放四个角：右上角与引号/标题同行（保底行高）；左上角占顶部一行，引号与标题整体下移。
                      字体：优先黑体（Windows SimHei），Mac/iOS/安卓无黑体时回退系统无衬线粗体效果 */}
                  {/* 标题区上方额外留白：随正文字号联动（默认 16px 正文约 8px） */}
                  <div
                    style={{
                      position: 'relative',
                      marginTop: Math.round(style.fontSize * 0.5),
                      paddingTop: titleTopOffset || undefined,
                      minHeight:
                        Math.max(
                          style.showTitle && title.trim() ? Math.round(style.titleSize * 1.4) + titleTopOffset : 0,
                          dateTopRight ? Math.round(dateFontSize * 1.4) : 0,
                          dateTopLeft ? Math.round(dateFontSize * 1.4) : 0,
                        ) || undefined,
                    }}
                  >
                    {showTopQuote && (
                      <div style={{ fontFamily: 'Georgia, serif', fontSize: style.fontSize * 2, lineHeight: 1, color: t.quote }}>“</div>
                    )}
                    {/* 标题：居中时绝对定位水平居中；左对齐时贴左显示，并改用与双引号同色的竖线 */}
                    {style.showTitle && title.trim() && (
                      <div
                        style={{
                          position: 'absolute',
                          top: titleTopOffset,
                          display: 'flex',
                          alignItems: 'center',
                          // 日期在右上角时收窄标题区，避免长标题与日期文字叠字
                          ...(titleLeft
                            ? { left: 0, right: dateTopRight ? '40%' : 0, justifyContent: 'flex-start' }
                            : {
                                left: 0,
                                right: 0,
                                justifyContent: 'center',
                                maxWidth: dateTopRight ? '58%' : undefined,
                                margin: '0 auto',
                              }),
                          fontFamily: 'SimHei, "Heiti SC", "Microsoft YaHei", sans-serif',
                          fontWeight: 700,
                          fontSize: style.titleSize,
                          lineHeight: 1,
                          color: titleColorHex,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                        }}
                      >
                        {titleLeft && style.showQuote && (
                          <span
                            style={{
                              width: 4,
                              height: Math.round(style.titleSize * 1.1),
                              backgroundColor: t.quote,
                              borderRadius: 2,
                              marginRight: Math.max(6, Math.round(style.titleSize * 0.35)),
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{title.trim()}</span>
                      </div>
                    )}
                    {style.showDate && (dateTopLeft || dateTopRight) && (
                      <div
                        style={{
                          position: 'absolute',
                          left: dateTopLeft ? 0 : undefined,
                          right: dateTopRight ? 0 : undefined,
                          top: 0,
                          color: dateColorHex,
                          fontSize: dateFontSize,
                          fontFamily: BASE_FONT,
                          lineHeight: 1.4,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dateLabel}
                      </div>
                    )}
                  </div>
                  {isMulti ? (
                    // 多消息卡片：每条一块——文字渲染昵称+正文，图片渲染昵称+图片（内部元素圆角保留）
                    <div style={{ marginTop: 10 }}>
                      {messages.map((m, i) => (
                        <div key={m.id} style={{ marginTop: i === 0 ? 0 : 16 }}>
                          {/* 昵称行：可用「显示-昵称」开关隐藏（多消息卡片）；「修改昵称」清空后该行也不显示 */}
                          {style.showNickname && nickOf(m).trim() !== '' && (
                            <div style={{ color: m.color || t.aux, fontSize: auxSize, fontFamily: BASE_FONT, lineHeight: 1.4 }}>
                              {nickOf(m)}
                            </div>
                          )}
                          {m.type === 'image' && m.file ? (
                            imgMap[m.id] ? (
                              <img
                                src={imgMap[m.id]}
                                alt={m.file.name}
                                style={{ maxWidth: '100%', borderRadius: 8, marginTop: 4, display: 'block' }}
                              />
                            ) : (
                              <div style={{ color: t.aux, fontSize: auxSize, fontFamily: BASE_FONT, marginTop: 4 }}>
                                [图片加载中…]
                              </div>
                            )
                          ) : (
                            <p
                              className="whitespace-pre-wrap break-all"
                              style={
                                {
                                  color: style.bodyColor ?? t.text,
                                  fontWeight: style.bold ? 700 : 400,
                                  textAlign: 'left',
                                  textIndent: 0,
                                  hangingPunctuation: 'none',
                                  WebkitPunctuationTrim: 'none',
                                } as React.CSSProperties
                              }
                            >
                              {m.type === 'text' ? contentOf(m) : `[文件] ${m.file?.name ?? ''}`}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p
                      className="whitespace-pre-wrap break-all"
                      style={
                        {
                          color: style.bodyColor ?? t.text,
                          marginTop: 10,
                          fontWeight: style.bold ? 700 : 400,
                          // 小屏左对齐修复：WebKit 默认对行首全角标点做标点压缩（-webkit-punctuation-trim: start），
                          // 正文首字符是逗号/句号等标点时会被缩成半角宽度并向左悬挂，与后续行文字左边缘不齐；
                          // 显式关闭标点压缩与标点悬挂（hanging-punctuation），任何屏宽下首字符与后续行左对齐
                          textAlign: 'left',
                          textIndent: 0,
                          hangingPunctuation: 'none',
                          WebkitPunctuationTrim: 'none',
                        } as React.CSSProperties
                      }
                    >
                      {contentOf(messages[0])}
                    </p>
                  )}
                  {(dateBottomLeft || dateBottomRight || style.showSignature) && (
                    <div
                      className="flex items-center justify-between"
                      style={{ borderTop: `1px solid ${t.line}`, marginTop: 20, paddingTop: 12, fontFamily: BASE_FONT }}
                    >
                      {/* 底部：日期左下角 + 署名右下角（默认）；日期在右下角时改为署名左、日期右。
                          日期在上方两个角时，底部不显示日期，只保留署名 */}
                      <span className="flex items-baseline" style={{ flexShrink: 0 }}>
                        {dateBottomRight ? signatureNode : dateBottomLeft ? dateNode : ''}
                      </span>
                      <span className="flex items-baseline">
                        {dateBottomRight ? (style.showDate ? dateNode : '') : signatureNode}
                      </span>
                    </div>
                  )}
                </div>
                {imgUrl && (
                  <img
                    src={imgUrl}
                    alt="分享卡片"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </div>
            </div>
          </div>

          {imgUrl && <p className="text-center text-sm text-gray-400">长按图片保存到相册</p>}
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <div className="flex space-x-3">
            <button
              onClick={() => void save()}
              disabled={busy}
              className="flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
              <span>{busy ? '生成中…' : imgUrl ? '重新生成' : isMobile() ? '生成图片' : '下载图片'}</span>
            </button>
            <button
              onClick={() => void copyText()}
              className={`flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                copied
                  ? 'bg-green-100 text-green-700'
                  : isDarkMode
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? '已复制' : '复制文字'}</span>
            </button>
            {imgUrl && typeof navigator.canShare === 'function' && (
              <button
                onClick={() => void share()}
                className={`flex items-center justify-center space-x-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isDarkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Share2 className="w-4 h-4" />
                <span>分享</span>
              </button>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* 「修改文本」小弹窗：署名/日期/标题/正文各自独立一个，点哪个按钮开哪个。
          标题/署名仍记 localStorage（全局卡片样式）；日期/正文覆写只对当前这张卡片生效，
          关掉卡片弹窗即失效，避免串到别的消息上。内容实时生效，「完成」/背景点击/Esc 仅关闭本弹窗 */}
      {textEdit && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4"
          onClick={() => setTextEdit(null)}
        >
          <div
            className={`rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between p-4 border-b flex-shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                {TEXT_EDIT_TITLES[textEdit]}
              </h3>
              <button
                onClick={() => setTextEdit(null)}
                className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto">
              {/* 署名：记 localStorage，20 字以内，留空不显示署名；有文字时右侧出现清空按钮 */}
              {textEdit === 'sig' && (
                <div>
                  <div className="relative">
                    <input
                      autoFocus
                      type="text"
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setTextEdit(null);
                      }}
                      maxLength={20}
                      placeholder="留空则不显示署名"
                      className={`${editInputCls} pr-8`}
                    />
                    {clearBtn(signature, () => setSignature(''))}
                  </div>

                  {/* 署名字号/颜色：可独立设置，未设置时跟随正文联动字号与主题辅助色 */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-10 flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>字号</span>
                      <input
                        type="range"
                        min={AUX_MIN}
                        max={AUX_MAX}
                        value={sigFontSize}
                        onChange={(e) => setStyle((s) => ({ ...s, sigSize: Number(e.target.value) }))}
                        className="flex-1 min-w-[120px] accent-green-500"
                      />
                      <span className={`w-10 text-right text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{sigFontSize}px</span>
                      {resetBtn(style.sigSize === undefined, () => setStyle((s) => ({ ...s, sigSize: undefined })), '恢复默认署名字号（跟随正文联动）')}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`w-10 flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>颜色</span>
                      {swatchRow(style.sigColor, (c) => setOptionalColor('sigColor', c), true)}
                    </div>
                  </div>

                  {/* 常用签名（仅浏览器本地）：点击切换当前签名，× 删除；最多保存 6 个 */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        常用签名（{signatures.length}/{MAX_SIGNATURES}）
                      </span>
                      <button
                        onClick={addSignature}
                        disabled={!canSaveSig}
                        className={`flex items-center gap-0.5 text-sm disabled:opacity-40 ${
                          isDarkMode ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'
                        }`}
                      >
                        保存当前
                      </button>
                    </div>
                    {signatures.length === 0 ? (
                      <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        还没有常用签名，输入后点「保存当前」即可加入
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {signatures.map((n) => (
                          <span
                            key={n}
                            className={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-sm border ${
                              signature === n
                                ? 'border-green-500 text-green-600'
                                : isDarkMode
                                  ? 'border-gray-600 bg-gray-700 text-gray-200'
                                  : 'border-gray-200 bg-gray-100 text-gray-700'
                            }`}
                          >
                            <button onClick={() => setSignature(n)} className="max-w-[160px] truncate" title={`切换为：${n}`}>
                              {n}
                            </button>
                            <button
                              onClick={() => removeSignature(n)}
                              title="删除该签名"
                              className={`p-0.5 rounded-full ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      点击签名可切换当前卡片署名；签名仅保存在本浏览器
                    </p>
                  </div>
                </div>
              )}

              {/* 日期：仅本次生效；改过可出现「还原」恢复消息默认日期；位置（左下角/右上角）记 localStorage */}
              {textEdit === 'date' && (
                <div className="space-y-3">
                  <div>
                    {editLabelRow('卡片日期', dateOverride.trim() !== '', () => setDateOverride(''))}
                    <input
                      autoFocus
                      type="text"
                      value={dateOverride}
                      onChange={(e) => setDateOverride(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setTextEdit(null);
                      }}
                      maxLength={30}
                      placeholder={`留空则使用消息日期（${defaultDateLabel}）`}
                      className={editInputCls}
                    />
                  </div>
                  <div>
                    <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>日期显示位置</span>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {(
                        [
                          ['bottom-left', '左下角'],
                          ['bottom-right', '右下角'],
                          ['top-left', '左上角'],
                          ['top-right', '右上角'],
                        ] as const
                      ).map(([key, label]) =>
                        toggleBtn(style.datePos === key, () => setStyle((s) => ({ ...s, datePos: key })), label),
                      )}
                    </div>
                  </div>
                  {/* 日期字号/颜色：可独立设置，未设置时跟随正文联动字号与主题辅助色 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-10 flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>字号</span>
                      <input
                        type="range"
                        min={AUX_MIN}
                        max={AUX_MAX}
                        value={dateFontSize}
                        onChange={(e) => setStyle((s) => ({ ...s, dateSize: Number(e.target.value) }))}
                        className="flex-1 min-w-[120px] accent-green-500"
                      />
                      <span className={`w-10 text-right text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{dateFontSize}px</span>
                      {resetBtn(style.dateSize === undefined, () => setStyle((s) => ({ ...s, dateSize: undefined })), '恢复默认日期字号（跟随正文联动）')}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`w-10 flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>颜色</span>
                      {swatchRow(style.dateColor, (c) => setOptionalColor('dateColor', c), true)}
                    </div>
                  </div>
                </div>
              )}

              {/* 标题：记 localStorage，20 字以内，留空不显示标题；有文字时右侧出现清空按钮 */}
              {textEdit === 'title' && (
                <div>
                  <div className="relative">
                    <input
                      autoFocus
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setTextEdit(null);
                      }}
                      maxLength={20}
                      placeholder="留空则不显示标题"
                      className={`${editInputCls} pr-8`}
                    />
                    {clearBtn(title, () => setTitle(''))}
                  </div>

                  {/* 标题字号/颜色：独立于正文，单独设置并记入浏览器本地 */}
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-10 flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>字号</span>
                      <input
                        type="range"
                        min={TITLE_MIN}
                        max={TITLE_MAX}
                        value={style.titleSize}
                        onChange={(e) => setStyle((s) => ({ ...s, titleSize: Number(e.target.value) }))}
                        className="flex-1 min-w-[120px] accent-green-500"
                      />
                      <span className={`w-10 text-right text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{style.titleSize}px</span>
                      {resetBtn(style.titleSize === 26, () => setStyle((s) => ({ ...s, titleSize: 26 })), '恢复默认标题字号 26px')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-10 flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>对齐</span>
                      {toggleBtn(style.titleAlign === 'center', () => setStyle((s) => ({ ...s, titleAlign: 'center' })), '居中对齐')}
                      {toggleBtn(style.titleAlign === 'left', () => setStyle((s) => ({ ...s, titleAlign: 'left' })), '左对齐')}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`w-10 flex-shrink-0 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>颜色</span>
                      {swatchRow(style.titleColor, (c) => setStyle((s) => ({ ...s, titleColor: c })), true)}
                    </div>
                  </div>

                  {/* 常用标题（仅浏览器本地）：点击切换当前标题，× 删除；最多保存 6 个 */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        常用标题（{titles.length}/{MAX_TITLES}）
                      </span>
                      <button
                        onClick={addTitle}
                        disabled={!canSaveTitle}
                        className={`flex items-center gap-0.5 text-sm disabled:opacity-40 ${
                          isDarkMode ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'
                        }`}
                      >
                        保存当前
                      </button>
                    </div>
                    {titles.length === 0 ? (
                      <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        还没有常用标题，输入后点「保存当前」即可加入
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {titles.map((n) => (
                          <span
                            key={n}
                            className={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-sm border ${
                              title === n
                                ? 'border-green-500 text-green-600'
                                : isDarkMode
                                  ? 'border-gray-600 bg-gray-700 text-gray-200'
                                  : 'border-gray-200 bg-gray-100 text-gray-700'
                            }`}
                          >
                            <button onClick={() => setTitle(n)} className="max-w-[160px] truncate" title={`切换为：${n}`}>
                              {n}
                            </button>
                            <button
                              onClick={() => removeTitle(n)}
                              title="删除该标题"
                              className={`p-0.5 rounded-full ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      点击标题可切换当前卡片标题；标题仅保存在本浏览器
                    </p>
                  </div>
                </div>
              )}

              {/* 正文：单消息一个输入框；多消息按消息逐个改（图片/文件消息没有可改文字，不列出） */}
              {textEdit === 'body' && (
                <div>
                  {/* 正文颜色：默认跟随主题，也可单独指定 */}
                  <div className="mb-3">
                    <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>正文颜色</span>
                    <div className="mt-1.5">
                      {swatchRow(style.bodyColor, (c) => setOptionalColor('bodyColor', c), true)}
                    </div>
                    <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      「默认」= 跟随当前卡片主题的正文颜色
                    </p>
                  </div>
                  {isMulti ? (
                  textMsgs.length > 0 ? (
                    <div className="space-y-3">
                      {textMsgs.map((m) => (
                        <div key={m.id}>
                          {editLabelRow(m.nickname, contentEdits[m.id] !== undefined, () =>
                            setContentEdits((prev) => {
                              const next = { ...prev };
                              delete next[m.id];
                              return next;
                            }),
                          )}
                          {/* 灰框包白卡（编辑框），与预览区结构一致 */}
                          <div className="flex justify-center">
                            <div className={bodyTaFrameCls}>
                              <AutoTextarea
                                autoFocus={m.id === textMsgs[0].id}
                                value={contentOf(m)}
                                onChange={(e) => setContentEdit(m.id, e.target.value, m.content)}
                                className={`${editInputCls} resize-y whitespace-pre-wrap`}
                                style={bodyTaStyle}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>没有可修改的文字消息</p>
                  )
                ) : (
                  <div>
                    {editLabelRow('卡片正文', contentEdits[messages[0].id] !== undefined, () =>
                      setContentEdits((prev) => {
                        const next = { ...prev };
                        delete next[messages[0].id];
                        return next;
                      }),
                    )}
                    {/* 灰框包白卡（编辑框），与预览区结构一致 */}
                    <div className="flex justify-center">
                      <div className={bodyTaFrameCls}>
                        <AutoTextarea
                          autoFocus
                          value={contentOf(messages[0])}
                          onChange={(e) => setContentEdit(messages[0].id, e.target.value, messages[0].content)}
                          className={`${editInputCls} resize-y whitespace-pre-wrap`}
                          style={bodyTaStyle}
                        />
                      </div>
                    </div>
                  </div>
                )}
                </div>
              )}

              {/* 昵称（仅多消息卡片有此入口）：按去重后的原昵称逐个改显示名，留空则卡片上不显示该昵称 */}
              {textEdit === 'nick' && (
                <div className="space-y-3">
                  {uniqueNicks.map((nick) => (
                    <div key={nick}>
                      {editLabelRow(nick, nickEdits[nick] !== undefined, () =>
                        setNickEdits((prev) => {
                          const next = { ...prev };
                          delete next[nick];
                          return next;
                        }),
                      )}
                      <input
                        autoFocus={nick === uniqueNicks[0]}
                        type="text"
                        value={nickEdits[nick] ?? nick}
                        onChange={(e) => setNickEdit(nick, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setTextEdit(null);
                        }}
                        maxLength={20}
                        placeholder="留空则卡片上不显示该昵称"
                        className={editInputCls}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* 配色：只改背景色/强调色，文字颜色仍在各自入口设置 */}
              {textEdit === 'color' && (
                <div className="space-y-3">
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    只调整背景与强调色；标题/正文/日期/署名文字颜色请到「修改」里分别设置。
                  </p>
                  <div>
                    <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>背景色</span>
                    <div className="mt-1.5">
                      {swatchRow(
                        colorEditBg,
                        setColorEditBg,
                        true,
                        theme === 'custom' ? THEMES.custom.bg : THEMES[theme].bg,
                      )}
                    </div>
                  </div>
                  <div>
                    <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>强调色</span>
                    <div className="mt-1.5">
                      {swatchRow(
                        colorEditAccent,
                        setColorEditAccent,
                        true,
                        theme === 'custom' ? THEMES.custom.quote : THEMES[theme].quote,
                      )}
                    </div>
                    <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      用于顶部双引号、左对齐竖线、署名小方块与图片边框。
                    </p>
                  </div>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    背景改深/改浅后，记得检查文字颜色是否仍清晰。
                  </p>
                </div>
              )}
            </div>

            <div className={`p-4 border-t flex-shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <button
                onClick={() => setTextEdit(null)}
                className="w-full py-2.5 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-colors"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
