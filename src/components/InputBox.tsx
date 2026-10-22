import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Paperclip, Smile, Image as ImageIcon, X, Loader2, CornerUpLeft, AtSign, Archive, Plus, FileText, Crop } from 'lucide-react';
import {
  IMAGE_MAX_WIDTH,
  IMAGE_QUALITY,
  IMAGE_COMPRESS_THRESHOLD_KB,
} from '../config';
import { ChatMessage, GroupMember } from '../api/types';
import { ImageCropModal } from './ImageCropModal';

interface Props {
  groupId: number;
  members: GroupMember[]; // 已排除自己，用于 @ 提醒
  archived: boolean; // 群已停用：仅可查看
  observer?: boolean; // 当前用户为观察者：仅可查看，不能发送
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  reEditDraft?: { text: string } | null; // 「重新编辑」：撤回消息的内容，填回输入框
  onReEditDraftDone?: () => void;
  onSendText: (content: string) => Promise<void>;
  onSendFile: (file: File | Blob, filename: string, kind: 'image' | 'file') => Promise<void>;
  sending: boolean;
  uploadProgress: number | null;
  isDarkMode: boolean;
  fontSize: number;
}

// 图片压缩：超宽缩小，大图转 JPEG
function compressImage(file: File): Promise<{ blob: Blob; filename: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const resized = width > IMAGE_MAX_WIDTH;
        if (resized) {
          height = Math.round((IMAGE_MAX_WIDTH / width) * height);
          width = IMAGE_MAX_WIDTH;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        // willReadFrequently 强制软件渲染画布：安卓 Firefox 硬件加速画布在缩小绘制大图时会输出全黑
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve({ blob: file, filename: file.name });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            // 缩过宽度的必须用压缩结果（限宽是硬要求，哪怕重压缩后体积略增）；
            // 未缩宽度时只有体积变小才用压缩结果
            if (blob && (resized || blob.size < file.size)) {
              const base = file.name.replace(/\.[^.]+$/, '') || 'image';
              resolve({ blob, filename: `${base}.jpg` });
            } else {
              resolve({ blob: file, filename: file.name });
            }
          },
          'image/jpeg',
          IMAGE_QUALITY,
        );
      };
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

// 快速探测图片宽度（只为判断是否需要限宽压缩；失败返回 0 当作不超宽）
function probeImageWidth(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.width);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    img.src = url;
  });
}

function replyPreviewOf(m: ChatMessage): string {
  if (m.type === 'image') return '[图片]';
  if (m.type === 'file') return `[文件] ${m.content}`;
  if (m.type === 'forward') return '[聊天记录]';
  return m.content;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 选择待发送的图片/文件（须用户点「发送」才真正发出，避免误发）
interface PendingAttachment {
  blob: File | Blob;
  filename: string;
  kind: 'image' | 'file';
  size: number;
  url: string | null;
}

export const InputBox = ({
  groupId,
  members,
  archived,
  observer = false,
  replyTo,
  onCancelReply,
  reEditDraft,
  onReEditDraftDone,
  onSendText,
  onSendFile,
  sending,
  uploadProgress,
  isDarkMode,
  fontSize,
}: Props) => {
  const draftKey = `smallchat-draft-${groupId}`;
  // 草稿按群保存在 localStorage（App 侧已按 groupId key 本组件，切群即重挂载恢复草稿）
  const [input, setInput] = useState<string>(() => localStorage.getItem(draftKey) ?? '');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [error, setError] = useState('');
  // 待发送的图片/文件预览（用户确认后才发送）
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  // 图片裁剪弹窗（普通图片发送前可自由框选，去掉不需要的部分）
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  // 移动端：三个入口按钮合并为一个加号
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [showPlus, setShowPlus] = useState(false);
  const [mobileEmoji, setMobileEmoji] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);

  // 监听断点切换（手机 / 桌面布局不同）
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // 移动端加号面板：点击外部关闭
  useEffect(() => {
    if (!showPlus) return;
    const onDown = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) {
        setShowPlus(false);
        setMobileEmoji(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showPlus]);

  // 图片预览用的 object URL 在替换或卸载时释放，避免内存泄漏
  useEffect(() => {
    if (!pending?.url) return;
    const url = pending.url;
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  const MAX_LINES = 12;
  const LINE_HEIGHT = Math.round(fontSize * 1.45);
  const MIN_HEIGHT = LINE_HEIGHT + 16;

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    // iOS 兼容：WebKit 在字体/布局未完成时 scrollHeight 会读到旧值，先强制 reflow 再测
    void ta.offsetHeight;
    ta.style.height = 'auto';
    // iOS 兼容：height 置 auto 后再强制一次 reflow，确保 scrollHeight 是最新布局的结果
    void ta.offsetHeight;
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_LINES * LINE_HEIGHT)}px`;
  };

  const changeInput = (v: string) => {
    setInput(v);
    if (v) localStorage.setItem(draftKey, v);
    else localStorage.removeItem(draftKey);
    // 输入 @ 弹成员选择
    setShowMention(v.endsWith('@'));
  };

  // 「重新编辑」：把撤回消息的内容填回输入框（追加到现有草稿之后，微信同款），一次性消费
  useEffect(() => {
    if (!reEditDraft?.text) return;
    changeInput(input + reEditDraft.text);
    // iOS 兼容：程序化赋值不触发 input 事件（autosize 依赖不上），且 iOS WebKit 在渲染帧前
    // scrollHeight 读数不准；等 rAF（React 已把新 value 写入 DOM、浏览器完成布局）再测高，
    // 再用 setTimeout 兜底一次（iPhone 上字体渲染/布局可能晚于首帧，二次校正保证长文本高度正确）
    requestAnimationFrame(() => {
      autoResize();
      setTimeout(autoResize, 100);
    });
    textareaRef.current?.focus();
    onReEditDraftDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reEditDraft]);

  const submitText = async () => {
    const content = input.trim();
    if (!content || sending) return;
    setError('');
    try {
      await onSendText(content);
      setInput('');
      localStorage.removeItem(draftKey);
      setShowMention(false);
      if (textareaRef.current) textareaRef.current.style.height = `${MIN_HEIGHT}px`;
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
    }
  };

  const insertMention = (m: GroupMember) => {
    changeInput(`${input.slice(0, -1)}@${m.nickname} `);
    setShowMention(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter=换行；Ctrl/Cmd+Enter=发送（误发长文/半截消息的预防）
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submitText();
    }
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setError('');
    try {
      let blob: File | Blob = file;
      let filename = file.name;
      let needCompress =
        file.size / 1024 > IMAGE_COMPRESS_THRESHOLD_KB ||
        (file.type === 'image/png' && file.size / 1024 > IMAGE_COMPRESS_THRESHOLD_KB);
      // 小图但超宽的也要压缩（限宽 900 是硬要求，服务端另有兜底）；gif 不动（保动画）
      if (!needCompress && file.type !== 'image/gif') {
        const w = await probeImageWidth(file);
        if (w > IMAGE_MAX_WIDTH) needCompress = true;
      }
      if (needCompress) {
        const r = await compressImage(file);
        blob = r.blob;
        filename = r.filename;
      }
      // 不直接发送：先展示预览，等用户点「发送」确认（避免误发错文件）
      setPending({ blob, filename, kind: 'image', size: blob.size, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片读取失败');
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setError('');
    if (file.size > 50 * 1024 * 1024) {
      setError('文件不能超过 50MB');
      return;
    }
    // 不直接发送：先展示预览，等用户点「发送」确认（避免误发错文件）
    setPending({ blob: file, filename: file.name, kind: 'file', size: file.size, url: null });
  };

  const confirmPending = async () => {
    if (!pending || sending) return;
    setError('');
    try {
      await onSendFile(pending.blob, pending.filename, pending.kind);
      setPending(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    }
  };

  const insertEmoji = (em: string) => {
    changeInput(input + em);
    textareaRef.current?.focus();
  };

  const emojis = [
    '😀', '😄', '😆', '😅', '🤣', '🙂', '😊', '😴', '🤗', '🥰',
    '😍', '😘', '😛', '😎', '🤓', '😔', '😢', '😭', '😡', '👍',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕',
    '☀️', '🌤️', '☁️', '🌧️', '❄️', '🔥', '💧', '🌸', '🍀', '⭐',
  ];

  const btnCls = `p-2 rounded-full transition-colors flex-shrink-0 ${
    isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
  }`;

  // 停用归档的群：输入区替换为提示条
  if (archived) {
    return (
      <div className={`border-t px-4 py-4 flex items-center justify-center space-x-2 text-sm ${isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-500' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
        <Archive className="w-4 h-4" />
        <span>该群已停用归档，仅可查看历史消息</span>
      </div>
    );
  }

  return (
    <div className={`border-t px-2 py-2 sm:px-4 sm:py-3 pb-safe ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      {uploadProgress !== null && (
        <div className="mb-2 flex items-center space-x-2 px-1">
          <Loader2 className="w-4 h-4 animate-spin text-green-500 flex-shrink-0" />
          <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
            <div className="h-full bg-green-500 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="text-xs text-gray-400 w-10 text-right">{uploadProgress}%</span>
        </div>
      )}

      {/* 引用回复条 */}
      {replyTo && (
        <div className={`mb-2 flex items-center space-x-2 px-3 py-1.5 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <CornerUpLeft className="w-4 h-4 text-green-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-green-600">回复 {replyTo.nickname}</p>
            <p className="truncate text-xs text-gray-400">{replyPreviewOf(replyTo)}</p>
          </div>
          <button onClick={onCancelReply} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="取消引用">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-sm text-red-500">{error}</span>
          <button onClick={() => setError('')} className="text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 待发送附件确认条：选中图片/文件后先预览，点「发送」才真正发出，避免误发 */}
      {pending && (
        <div className={`mb-2 flex items-center gap-3 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          {pending.kind === 'image' && pending.url ? (
            <img src={pending.url} alt={pending.filename} className="h-16 w-16 object-cover rounded-lg flex-shrink-0" />
          ) : (
            <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-gray-600 text-gray-300' : 'bg-white text-gray-500'}`}>
              <FileText className="w-5 h-5" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className={`truncate text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`} title={pending.filename}>
              {pending.filename}
            </p>
            <p className="text-xs text-gray-400">{humanSize(pending.size)}</p>
          </div>
          {pending.kind === 'image' && pending.url && !/\.gif$/i.test(pending.filename) && (
            <button
              onClick={() => setCropSrc(pending.url)}
              disabled={sending}
              className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
                isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-200'
              }`}
              title="裁剪图片"
              aria-label="裁剪图片"
            >
              <Crop className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setPending(null)}
            disabled={sending}
            className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
              isDarkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-200'
            }`}
            title="取消发送"
            aria-label="取消发送"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={confirmPending}
            disabled={sending}
            className="flex-shrink-0 px-4 py-1.5 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            发送
          </button>
        </div>
      )}

      <div className="flex items-end gap-1 w-full">
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
        <input ref={fileInputRef} type="file" onChange={handleFile} className="hidden" />

        {/* 桌面端：图片 / 文件 / 表情 三个独立按钮 */}
        {!isMobile && (
          <>
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={sending || observer}
              className={`${btnCls} disabled:opacity-50 disabled:cursor-not-allowed`}
              title="发送图片"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || observer}
              className={`${btnCls} disabled:opacity-50 disabled:cursor-not-allowed`}
              title="发送文件"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            {/* flex-shrink-0：窄窗口下防止此 div 被压缩导致表情按钮溢出、与相邻按钮图标重叠 */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowEmoji(!showEmoji)}
                disabled={observer}
                className={`${btnCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                title="表情"
              >
                <Smile className="w-5 h-5" />
              </button>
              {showEmoji && (
                <div
                  className={`absolute bottom-full left-0 mb-2 p-2 rounded-xl shadow-lg border grid grid-cols-10 gap-1 z-30 ${
                    isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {emojis.map((em, i) => (
                    <button
                      key={i}
                      onClick={() => insertEmoji(em)}
                      className={`text-xl p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* 移动端：一个圆形加号，弹出面板收纳 图片/文件/表情 */}
        {isMobile && (
          <div className="relative" ref={plusRef}>
            <button
              onClick={() => {
                setShowPlus(!showPlus);
                setMobileEmoji(false);
              }}
              disabled={observer}
              className={`rounded-full border flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                showPlus
                  ? 'bg-green-500 text-white border-green-500'
                  : isDarkMode
                    ? 'text-gray-400 border-gray-600 hover:text-green-400'
                    : 'text-gray-500 border-gray-300 hover:text-green-600'
              }`}
              style={{ width: MIN_HEIGHT, height: MIN_HEIGHT }}
              title="更多"
            >
              <Plus className={`w-5 h-5 transition-transform ${showPlus ? 'rotate-45' : ''}`} />
            </button>
            {showPlus && (
              <div
                className={`absolute bottom-full left-0 mb-2 rounded-2xl shadow-lg border z-30 ${
                  isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                }`}
              >
                {mobileEmoji ? (
                  <div className="p-2 grid grid-cols-8 gap-1 w-[280px] max-w-[78vw]">
                    {emojis.map((em, i) => (
                      <button
                        key={i}
                        onClick={() => insertEmoji(em)}
                        className={`text-xl p-1 rounded transition-colors ${isDarkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-2 w-36">
                    <button
                      onClick={() => {
                        setShowPlus(false);
                        imageInputRef.current?.click();
                      }}
                      disabled={sending}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-sm ${
                        isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-5 h-5" />
                      </span>
                      <span>图片</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowPlus(false);
                        fileInputRef.current?.click();
                      }}
                      disabled={sending}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-sm ${
                        isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </span>
                      <span>文件</span>
                    </button>
                    <button
                      onClick={() => setMobileEmoji(true)}
                      className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-sm ${
                        isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                        <Smile className="w-5 h-5" />
                      </span>
                      <span>表情</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* min-w-0：flex 教科书修复——允许此容器在空间不足时收缩（否则 min-width:auto 被内容卡死，
            挤压左侧表情按钮的外层 div，造成桌面端窄聊天区时图标重叠） */}
        <div className="relative flex-1 min-w-0 mx-1">
          {/* @ 成员选择 */}
          {showMention && members.length > 0 && (
            <div
              className={`absolute bottom-full left-0 mb-2 w-60 max-h-52 overflow-y-auto rounded-xl shadow-lg border z-30 ${
                isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
              }`}
            >
              <p className={`text-xs px-3 py-1.5 flex items-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <AtSign className="w-3 h-3 mr-1" />
                选择要提醒的人
              </p>
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => insertMention(m)}
                  className={`w-full flex items-center space-x-2 px-3 py-2 text-sm ${
                    isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.nickname.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{m.nickname}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={input}
            disabled={observer}
            onChange={(e) => {
              changeInput(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            onMouseDown={(e) => e.stopPropagation()}
            onFocus={() => {
              setShowEmoji(false);
              setShowMention(false);
              setShowPlus(false);
              setMobileEmoji(false);
            }}
            placeholder={
              observer
                ? '观察者仅可查看，不能发送消息'
                : isMobile
                  ? ''
                  : '输入消息，Enter 换行，Ctrl+Enter 发送，@ 提醒成员'
            }
            rows={1}
            className={`w-full px-3 py-2 rounded-2xl outline-none resize-none overflow-y-auto disabled:cursor-not-allowed ${
              isDarkMode ? 'bg-gray-700 text-white placeholder-gray-400' : 'bg-gray-100 text-gray-800 placeholder-gray-400'
            }`}
            style={{
              minHeight: `${MIN_HEIGHT}px`,
              maxHeight: `${MAX_LINES * LINE_HEIGHT}px`,
              lineHeight: `${LINE_HEIGHT}px`,
              fontSize: `${fontSize}px`,
            }}
          />
        </div>

        <button
          onClick={submitText}
          disabled={!input.trim() || sending || observer}
          className={`self-end rounded-full transition-all flex items-center justify-center flex-shrink-0 ${
            input.trim() && !sending && !observer
              ? 'bg-green-500 text-white hover:bg-green-600 shadow-md'
              : isDarkMode
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
          style={{ width: MIN_HEIGHT, height: MIN_HEIGHT }}
          title="发送"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>

      {cropSrc && pending && (
        <ImageCropModal
          src={cropSrc}
          filename={pending.filename}
          isDarkMode={isDarkMode}
          onClose={() => setCropSrc(null)}
          onDone={(blob, filename) => {
            setPending({ blob, filename, kind: 'image', size: blob.size, url: URL.createObjectURL(blob) });
            setCropSrc(null);
          }}
        />
      )}
    </div>
  );
};
