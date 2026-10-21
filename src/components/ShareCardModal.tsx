// 「生成分享卡片」弹窗：把一条或多条消息（文字/图片混排）渲染成高清 PNG，方便发朋友圈/抖音
// 字号/字体/边距/卡片签名/日期署名开关仅记在浏览器 localStorage，不进后端数据库
import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { X, ImageDown, Share2, Loader2, Bold, Copy, Check } from 'lucide-react';
import { ChatMessage } from '../api/types';
import { API_BASE } from '../config';
import { tokenStore } from '../api/client';

interface Props {
  messages: ChatMessage[]; // 单条卡片传长度 1 的数组；多条按时间正序
  cardSignature: string; // 服务器上的卡片签名：仅作首次迁移的初始值（本地无签名时采用），此后以 localStorage 为准
  isDarkMode: boolean;
  onClose: () => void;
}

type CardTheme = 'light' | 'dark' | 'blue' | 'orange' | 'green';

// 卡片配色固定，不随 App 暗色模式变化（弹窗内单独切换）；蓝/橙/绿为分享向低饱和配色
const THEMES: Record<CardTheme, { bg: string; text: string; quote: string; aux: string; line: string }> = {
  light: { bg: '#FFFFFF', text: '#1F2937', quote: '#0FDC78', aux: '#9CA3AF', line: '#E5E7EB' },
  dark: { bg: '#18181B', text: '#F4F4F5', quote: '#32F08C', aux: '#71717A', line: '#3F3F46' },
  blue: { bg: '#EFF6FF', text: '#1E3A5F', quote: '#2563EB', aux: '#93A3B8', line: '#BFDBFE' },
  orange: { bg: '#FFF7ED', text: '#44403C', quote: '#EA580C', aux: '#A8A29E', line: '#FED7AA' },
  green: { bg: '#F0FDF4', text: '#1F2937', quote: '#16A34A', aux: '#8FA79B', line: '#BBF7D0' },
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

// 外观设置持久化在浏览器本地（跨会话记忆，仅本设备生效）
const STYLE_KEY = 'smallchat-card-style';
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
  signature?: string;
  title?: string; // 卡片标题（顶部居中，与双引号同行同字号同色）
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
          signature,
          title,
        };
      }
    }
  } catch {
    // 损坏数据按默认处理
  }
  return { theme: 'light', fontSize: 16, fontKey: 'default', padKey: 'standard', bold: false, showDate: true, showSignature: true, showNickname: true, showQuote: true, showTitle: true };
};

const isMobile = () => /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

// 「修改文本」小弹窗的目标字段（nick 仅多消息卡片出现）
type TextEditTarget = 'sig' | 'date' | 'title' | 'body' | 'nick';
const TEXT_EDIT_TITLES: Record<TextEditTarget, string> = {
  sig: '修改署名',
  date: '修改日期',
  title: '修改标题',
  body: '修改正文',
  nick: '修改昵称',
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
    delete s.title; // 标题单独管，不混在样式选项里
    return s;
  });
  // 卡片签名仅存浏览器：本地没有时以服务器值（cardSignature prop）为初始值做一次性迁移，老用户无感；留空则卡片不显示署名
  const [signature, setSignature] = useState<string>(() => loadStyle().signature ?? cardSignature);
  // 卡片标题仅存浏览器（与署名同模式），顶部居中显示；留空则不显示
  const [title, setTitle] = useState<string>(() => loadStyle().title ?? '');
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

  const t = THEMES[theme];
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
      localStorage.setItem(STYLE_KEY, JSON.stringify({ ...style, theme, signature, title }));
    } catch {
      // 存储不可用时忽略（无痕模式等）
    }
  }, [style, theme, signature, title]);

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

  const auxSize = Math.max(12, Math.round(style.fontSize * 0.8)); // 日期/署名/水印随正文字号联动

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
              </>,
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
              </>,
            )}
            {settingRow(
              '字体',
              <>
                {Object.entries(FONT_OPTS).map(([key, o]) =>
                  optBtn(style.fontKey === key, () => setStyle((s) => ({ ...s, fontKey: key })), o.label),
                )}
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
              '边距',
              Object.entries(PAD_OPTS).map(([key, o]) =>
                optBtn(style.padKey === key, () => setStyle((s) => ({ ...s, padKey: key })), o.label),
              ),
            )}
            {/* 修改：署名/日期/标题/正文/昵称（昵称仅多消息卡片）各自独立小弹窗，改哪项点哪项 */}
            {settingRow(
              '修改',
              <>
                {textEditBtn('sig', '署名')}
                {textEditBtn('date', '日期')}
                {textEditBtn('title', '标题')}
                {textEditBtn('body', '正文')}
                {isMulti && textEditBtn('nick', '昵称')}
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
                  {/* 顶部：装饰双引号（左）+ 标题（居中，与双引号同行；黑体、黑色，比双引号小 4 号）。
                      标题用绝对定位居中，不挤动双引号；标题显示时容器保底行高，避免双引号关闭后正文贴顶。
                      深色主题卡片底为深色，黑色标题不可见，故 dark 下用白；
                      字体：优先黑体（Windows SimHei），Mac/iOS/安卓无黑体时回退系统无衬线粗体效果 */}
                  <div style={{ position: 'relative', minHeight: style.showTitle && title.trim() ? style.fontSize * 2 : undefined }}>
                    {style.showQuote && (
                      <div style={{ fontFamily: 'Georgia, serif', fontSize: style.fontSize * 2, lineHeight: 1, color: t.quote }}>“</div>
                    )}
                    {style.showTitle && title.trim() && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: 0,
                          textAlign: 'center',
                          fontFamily: 'SimHei, "Heiti SC", "Microsoft YaHei", sans-serif',
                          fontWeight: 700,
                          fontSize: style.fontSize * 2 - 4,
                          lineHeight: 1,
                          color: theme === 'dark' ? '#f5f5f5' : '#000',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {title.trim()}
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
                                  color: t.text,
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
                          color: t.text,
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
                  {(style.showDate || style.showSignature) && (
                    <div
                      className="flex items-center justify-between"
                      style={{ borderTop: `1px solid ${t.line}`, marginTop: 20, paddingTop: 12, fontFamily: BASE_FONT }}
                    >
                      {/* 底部：日期居左、签名居右，无水印无连接符；右下角主题色小方块与左上角引号形成视觉呼应 */}
                      <span style={{ color: t.aux, fontSize: auxSize, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {style.showDate ? dateLabel : ''}
                      </span>
                      {/* 签名+小方块 baseline 对齐：空 inline-block 的 baseline 即其底边，方块底正好落在文字基线上（中文字形底≈基线），任何字号下视觉都是"与文字底对齐" */}
                      <span className="flex items-baseline" style={{ color: t.aux, fontSize: auxSize, textAlign: 'right' }}>
                        {style.showSignature && (
                          <>
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
                          </>
                        )}
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
              )}

              {/* 日期：仅本次生效；改过可出现「还原」恢复消息默认日期 */}
              {textEdit === 'date' && (
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
              )}

              {/* 标题：记 localStorage，20 字以内，留空不显示标题；有文字时右侧出现清空按钮 */}
              {textEdit === 'title' && (
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
              )}

              {/* 正文：单消息一个输入框；多消息按消息逐个改（图片/文件消息没有可改文字，不列出） */}
              {textEdit === 'body' &&
                (isMulti ? (
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
                ))}

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
