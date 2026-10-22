import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy, Trash2, Download, FileText, AlertCircle, Clock, CheckCheck,
  CornerUpLeft, CheckSquare, Square, Pin, ListChecks, X, StickyNote,
  Palette, TextSelect, BellRing, Forward, Undo2, ImageDown, Wallet, Calendar,
} from 'lucide-react';
import { ChatMessage, ForwardPayload, ForwardItem } from '../api/types';
import { fileUrl } from '../config';
import { Avatar } from './Avatar';
import { isOverdueTodo } from './PanelShared';

interface Props {
  message: ChatMessage;
  isSelf: boolean;
  canDelete: boolean;
  canManage: boolean; // 当前用户是否可管理（群主/副群主；私聊恒 true）：置顶/待办/颜色标记/公共备注编辑等
  isPinned: boolean;
  isDm: boolean;
  peerRead: boolean; // 私聊中对方已读到这条
  selectMode: boolean;
  highlighted?: boolean; // 面板跳转定位时短暂高亮
  onDelete: (id: number) => Promise<void> | void;
  onRecall: (id: number) => Promise<void> | void; // 撤回自己的消息（2 分钟内）
  reEdit?: { content: string; at: number } | null; // 本条撤回消息的可「重新编辑」信息（at=撤回时间戳）
  onReEdit?: (id: number, text: string) => void; // 点击「重新编辑」：把撤回内容填回输入框
  onReEditRecord?: (id: number, content: string) => void; // 撤回成功后记录内容（仅文本消息）
  onForwardSingle: (msg: ChatMessage, withSource?: boolean) => void; // 单条转发到其他群
  onSetTodo: (msg: ChatMessage, status: number, note?: string) => void;
  onSetDue?: (msg: ChatMessage) => void; // 设置/清除到点提醒（可选，未传则不显示入口）
  onSetNote: (msg: ChatMessage, note: string, scope: 'private' | 'public') => Promise<void> | void;
  privateNotes: Record<number, string>; // 私有备注（仅本人）
  onAvatarClick: (userId: number) => void; // 点击头像查看用户详情
  onStartReply: (msg: ChatMessage) => void;
  onTogglePin: (msg: ChatMessage) => void;
  onShareCard: (msg: ChatMessage) => void; // 生成分享卡片（仅文本消息显示入口）
  onSetColor: (msg: ChatMessage, color: number) => void;
  onSetAmount?: (msg: ChatMessage) => void; // 记账/改金额（群主/副群主或私聊）
  onDelegateAmount?: (msg: ChatMessage) => void; // 普通成员委托群主/副群主代为记账
  ledgerEnabled: boolean; // 该会话是否开启财务记账（未开启则不显示金额徽章与记账入口）
  onEnterSelect: (msg: ChatMessage) => void;
  onTodoNoteEdit?: (msg: ChatMessage) => void; // 添加/修改待办备注（统一走待办备注弹窗，不再用 prompt）
  foldLen: number; // 长文本默认折叠的字数阈值（0=不折叠；本设备设置）
  isDarkMode: boolean;
  fontSize: number;
  bubbleStyle?: 'green' | 'white'; // 我的气泡样式（默认 green 经典绿底；white 时自己的气泡与对方一致白底黑字）
}

function shortTime(createdAt: string): string {
  // 后端格式 Y-m-d H:i:s；今天的消息只显示 HH:mm，昨天及之前显示完整日期时间 YYYY-MM-DD HH:mm
  if (createdAt.length < 16) return createdAt;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return createdAt.slice(0, 10) === todayStr ? createdAt.slice(11, 16) : createdAt.slice(0, 16);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 金额（分）→ 元，带千分位与两位小数
export function fmtMoney(cents: number): string {
  return (Math.abs(cents) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 记账徽章信息：支出/退款（浅红带「退」）/收入/收入调减（浅绿带「减」）
// 徽章自带底色，故在绿底气泡、白底气泡、深色模式下均可读
export interface AmountBadgeInfo {
  label: string;
  text: string;
  cls: string; // 徽章整体配色（浅底 + 深字）
  marker: string; // 抵减类标记字（「退」「减」），空则不显示
  markerCls: string;
}

export function amountBadgeInfo(kind: number, cents: number | null): AmountBadgeInfo | null {
  if (!kind || cents === null || cents === 0) return null;
  const text = `¥${fmtMoney(cents)}`;
  if (kind === 1) {
    return cents > 0
      ? { label: '支出', text, cls: 'text-red-600 bg-red-100 dark:text-red-200 dark:bg-red-900/60', marker: '', markerCls: '' }
      : {
          label: '退款',
          text,
          cls: 'text-rose-600 bg-rose-50 dark:text-rose-200 dark:bg-rose-900/50',
          marker: '退',
          markerCls: 'bg-rose-500',
        };
  }
  return cents > 0
    ? { label: '收入', text, cls: 'text-green-700 bg-green-100 dark:text-green-200 dark:bg-green-900/60', marker: '', markerCls: '' }
    : {
        label: '收入调减',
        text,
        cls: 'text-emerald-600 bg-emerald-50 dark:text-emerald-200 dark:bg-emerald-900/50',
        marker: '减',
        markerCls: 'bg-emerald-500',
      };
}

// 颜色标记选项（菜单里排成一行图标，节省菜单高度）
const COLOR_OPTS: { color: number; bg: string; title: string }[] = [
  { color: 1, bg: 'bg-red-500', title: '红色：危险、需要特别留意' },
  { color: 2, bg: 'bg-orange-500', title: '橘色：积极、给人力量' },
  { color: 6, bg: 'bg-yellow-400', title: '黄色：关心的事情' },
  { color: 7, bg: 'bg-green-500', title: '绿色：读书笔记、时文阅读' },
  { color: 3, bg: 'bg-blue-500', title: '蓝色：业务流程备注' },
  { color: 5, bg: 'bg-purple-500', title: '紫色：想法、创意' },
  { color: 4, bg: 'bg-gray-500', title: '灰色：高于普通的关注事项' },
];

function forwardItemPreview(it: ForwardItem): string {
  if (it.type === 'image') return '[图片]';
  if (it.type === 'file') return `[文件] ${it.file?.name ?? ''}`;
  return it.content;
}

// 「重新编辑」链接保留时长（撤回后 5 分钟内可一键填回输入框，微信同款）
const REEDIT_WINDOW_MS = 5 * 60 * 1000;

// 合并转发详情弹窗
const ForwardDetail = ({
  payload,
  isDarkMode,
  onClose,
}: {
  payload: ForwardPayload;
  isDarkMode: boolean;
  onClose: () => void;
}) => (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={onClose}>
    <div
      className={`rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`flex items-center justify-between p-4 border-b flex-shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
        <h3 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{payload.title}</h3>
        <button
          onClick={onClose}
          className={`p-1.5 rounded-lg flex-shrink-0 ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 overflow-y-auto space-y-3">
        {payload.items.map((it, i) => (
          <div key={i}>
            <p className="mb-0.5">
              <span className="font-medium text-sm" style={{ color: it.color }}>{it.nickname}</span>
              <span className="text-xs text-gray-400 ml-2">{it.created_at.slice(5, 16)}</span>
            </p>
            {it.type === 'text' && (
              <p className={`text-sm whitespace-pre-wrap break-words ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{it.content}</p>
            )}
            {it.type === 'image' && it.file && (
              <img src={fileUrl(it.file.url)} alt={it.file.name} loading="lazy" className="max-h-48 rounded-lg" />
            )}
            {it.type === 'file' && it.file && (
              <a
                href={fileUrl(it.file.url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-2 text-sm text-green-600 hover:underline"
              >
                <FileText className="w-4 h-4" />
                <span>{it.file.name}</span>
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// 消息备注编辑弹窗（单窗口完成：选私有/公共 + 输入）
const NoteModal = ({
  isDarkMode,
  canPublic,
  publicNote,
  privateNote,
  onSave,
  onClose,
}: {
  isDarkMode: boolean;
  canPublic: boolean; // 是否允许编辑公共备注（作者/管理员）
  publicNote: string;
  privateNote: string;
  onSave: (note: string, scope: 'private' | 'public') => Promise<void> | void;
  onClose: () => void;
}) => {
  const [pubNote, setPubNote] = useState(publicNote);
  const [privNote, setPrivNote] = useState(privateNote);
  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-xl w-full max-w-sm ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>消息备注</h3>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* 公共备注 */}
          <div>
            <div className={`flex items-center justify-between mb-1 ${canPublic ? '' : 'opacity-50'}`}>
              <span className={`text-sm font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                公共备注（全员可见）
              </span>
              {!canPublic && (
                <span className="text-xs text-gray-400" title="仅消息作者或管理员可编辑公共备注">
                  只读
                </span>
              )}
            </div>
            <textarea
              value={pubNote}
              onChange={(e) => canPublic && setPubNote(e.target.value.slice(0, 500))}
              readOnly={!canPublic}
              rows={3}
              autoFocus={canPublic}
              placeholder={canPublic ? '公共备注，全员可见（留空清除）' : '无公共备注'}
              className={`w-full px-3 py-2 text-sm border rounded-lg outline-none resize-none ${
                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'
              } ${canPublic ? 'focus:ring-2 focus:ring-blue-500' : 'cursor-not-allowed'}`}
            />
          </div>
          {/* 个人备注 */}
          <div>
            <span className={`text-sm font-medium ${isDarkMode ? 'text-green-300' : 'text-green-600'}`}>
              我的备注（仅自己可见）
            </span>
            <textarea
              value={privNote}
              onChange={(e) => setPrivNote(e.target.value.slice(0, 500))}
              rows={3}
              autoFocus={!canPublic}
              placeholder="私有备注，仅自己可见（留空清除）"
              className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-green-500 resize-none ${
                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'
              }`}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm rounded-lg ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              取消
            </button>
            <button
              onClick={async () => {
                // 顺序保存，避免 SQLite 并发写锁冲突；非作者跳过公共备注
                if (canPublic) {
                  await onSave(pubNote.trim(), 'public');
                }
                await onSave(privNote.trim(), 'private');
                onClose();
              }}
              className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const MessageBubble = ({
  message,
  isSelf,
  canDelete,
  canManage,
  isPinned,
  isDm,
  peerRead,
  selectMode,
  highlighted = false,
  onDelete,
  onRecall,
  reEdit,
  onReEdit,
  onReEditRecord,
  onForwardSingle,
  onSetTodo,
  onSetDue,
  onSetNote,
  privateNotes,
  onAvatarClick,
  onStartReply,
  onTogglePin,
  onShareCard,
  onSetColor,
  onSetAmount,
  onDelegateAmount,
  ledgerEnabled,
  onEnterSelect,
  onTodoNoteEdit,
  foldLen,
  isDarkMode,
  fontSize,
  bubbleStyle = 'green',
}: Props) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selMode, setSelMode] = useState(false); // 文本选择模式（长按/右键菜单与拖动选择冲突，故单独开启）
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [expanded, setExpanded] = useState(false); // 长文本展开（超过 200 字默认折叠）
  const [reEditVisible, setReEditVisible] = useState(true); // 「重新编辑」链接是否还在展示期
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 「重新编辑」链接：撤回 5 分钟后自动消失（微信同款）
  useEffect(() => {
    if (!reEdit) return;
    const remain = reEdit.at + REEDIT_WINDOW_MS - Date.now();
    setReEditVisible(remain > 0);
    if (remain <= 0) return;
    const t = setTimeout(() => setReEditVisible(false), remain);
    return () => clearTimeout(t);
  }, [reEdit]);

  useEffect(() => {
    if (!showMenu) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    const onScroll = () => setShowMenu(false);
    document.addEventListener('mousedown', onClick);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [showMenu]);

  // 文本选择模式：点击气泡外部即退出
  useEffect(() => {
    if (!selMode) return;
    const onDown = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        setSelMode(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [selMode]);

  const openMenu = (clientX?: number, clientY?: number) => {
    // 多选模式、文本选择模式、未发送成功的临时消息不弹菜单
    if (selectMode || selMode || message.id < 0) return;
    if (!bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    const menuW = 210;
    const menuH = 400; // 仅为初始估算，渲染后按实测尺寸二次校正（见下方 useLayoutEffect）
    // 右键/长按时使用触点位置，否则在气泡底部
    let x: number;
    let y: number;
    if (clientX !== undefined && clientY !== undefined) {
      x = clientX + 4;
      y = clientY + 4;
    } else {
      x = isSelf ? rect.right - menuW : rect.left;
      y = rect.bottom + 6;
    }
    if (x < 8) x = 8;
    if (x + menuW > window.innerWidth - 8) x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight - 8) y = Math.max(8, window.innerHeight - menuH - 8);
    setMenuPos({ x, y });
    setShowMenu(true);
  };

  // 菜单渲染后按实测宽高二次校正位置（修复 iPhone Chrome 上固定估算高度导致的菜单偏上问题）
  useLayoutEffect(() => {
    if (!showMenu) return;
    const el = menuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let { x, y } = menuPos;
    if (x + r.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r.width - 8);
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - r.height - 8);
    if (x !== menuPos.x || y !== menuPos.y) setMenuPos({ x, y });
  }, [showMenu]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPress = (e: React.MouseEvent | React.TouchEvent) => {
    // 记录触点位置，菜单出现在手指/鼠标按下处（微信同款交互）
    const point = 'touches' in e ? e.touches[0] : e;
    const cx = point.clientX;
    const cy = point.clientY;
    pressTimer.current = setTimeout(() => openMenu(cx, cy), 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const copyText = async (withTime: boolean) => {
    const text = withTime
      ? `[${message.created_at.slice(0, 16)}] ${message.nickname}：${message.content}`
      : message.content;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 忽略
    }
    setShowMenu(false);
  };

  const handleDelete = () => {
    setShowMenu(false);
    if (confirm('确定删除这条消息吗？删除后群内所有设备都不再显示。')) {
      Promise.resolve(onDelete(message.id)).catch((e: unknown) =>
        alert(e instanceof Error ? e.message : '删除失败'),
      );
    }
  };

  const handleRecall = () => {
    setShowMenu(false);
    if (confirm('确定撤回这条消息吗？')) {
      const content = message.content; // 撤回后本地内容会被清空，先记住供「重新编辑」
      Promise.resolve(onRecall(message.id))
        .then(() => {
          if (message.type === 'text' && content) onReEditRecord?.(message.id, content);
        })
        .catch((e: unknown) =>
          alert(e instanceof Error ? e.message : '撤回失败'),
        );
    }
  };

  const editNote = () => {
    setShowMenu(false);
    // 统一走待办备注弹窗（含快速时长文本）；未传回调时退回简易输入
    if (onTodoNoteEdit) {
      onTodoNoteEdit(message);
      return;
    }
    const note = window.prompt('待办备注（留空清除备注）', message.todo_note ?? '');
    if (note === null) return;
    onSetTodo(message, message.todo_status, note.trim());
  };

  const editMsgNote = () => {
    setShowMenu(false);
    setShowNoteModal(true);
  };

  const openFile = () => {
    if (message.file) window.open(fileUrl(message.file.url), '_blank');
  };

  // 2 分钟内自己的消息可撤回（后端同样校验）
  const createdMs = new Date(message.created_at.replace(' ', 'T')).getTime();
  const canRecall =
    isSelf &&
    !message.status &&
    message.id > 0 &&
    Number.isFinite(createdMs) &&
    Date.now() - createdMs < 2 * 60 * 1000;

  const forwardPayload = (() => {
    if (message.type !== 'forward') return null;
    try {
      return JSON.parse(message.content) as ForwardPayload;
    } catch {
      return null;
    }
  })();

  // 长文本折叠：超过设置的字数阈值默认折叠 6 行（阈值 0=不折叠），避免一条消息占满整个屏幕
  const isLongText = foldLen > 0 && message.type === 'text' && message.content.length > foldLen;

  const menuBtn = `w-full flex items-center space-x-2 px-3 py-2 text-sm ${
    isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
  }`;

  // 气泡内辅助文字（待办标记、备注、引用、时间等）统一字号：跟随设置缩放，最小 14px
  const auxSize = Math.max(fontSize - 6, 14);
  const smallStyle = { fontSize: `${auxSize}px` };

  // 配色是否走「绿底白字」：白底样式下自己的气泡配色与对方一致（布局仍在右侧，由 isSelf 决定）
  const green = isSelf && bubbleStyle === 'green';

  // 记账徽章（额度信息）：仅在该会话开启财务记账时显示
  const money = ledgerEnabled ? amountBadgeInfo(message.amount_kind, message.amount_cents) : null;

  // 待办已超期（到点未完成）：红色提醒徽章与外层待办徽章的右/上/下边缘齐平，避免露出一圈黄边
  const todoOverdue = isOverdueTodo(message.due_at, message.todo_status);

  if (message.deleted === 1) {
    // 撤回：居中灰字提示（微信同款）；被管理员删除的消息：完全不显示（删除就是不想让人看到）
    if (message.recalled === 1) {
      const showReEdit = isSelf && reEditVisible && !!reEdit?.content;
      return (
        <div id={`msg-${message.id}`} className="flex justify-center mb-3 scroll-mt-20">
          <div className="text-gray-400 px-3 py-1" style={smallStyle}>
            {isSelf ? '你' : message.nickname}撤回了一条消息
            {showReEdit && (
              <span
                onClick={() => onReEdit?.(message.id, reEdit!.content)}
                className={`ml-2 cursor-pointer hover:underline ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}
              >
                重新编辑
              </span>
            )}
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      <div
        id={`msg-${message.id}`}
        className={`flex ${isSelf ? 'justify-end' : 'justify-start'} mb-3 scroll-mt-20 rounded-lg transition-colors duration-1000 ${
          highlighted ? (isDarkMode ? 'bg-blue-900/50' : 'bg-blue-100') : ''
        }`}
      >
        {/* 头像：对方在左，自己在右；点击查看用户详情 */}
        {!isSelf && (
          <span onClick={() => onAvatarClick(message.user_id)} className="cursor-pointer flex-shrink-0" title="查看用户信息">
            <Avatar
              userId={message.user_id}
              nickname={message.nickname}
              color={message.color}
              avatarVer={message.avatar_ver ?? 0}
              size={36}
              className="mr-2 mt-0.5"
            />
          </span>
        )}
        <div
          ref={bubbleRef}
          className={`max-w-[78%] sm:max-w-[70%] ${selMode ? 'select-text' : 'select-none'} ${isSelf ? 'items-end' : 'items-start'} flex flex-col`}
          onMouseDown={selMode ? undefined : startPress}
          onMouseUp={selMode ? undefined : cancelPress}
          onMouseMove={selMode ? undefined : cancelPress}
          onMouseLeave={selMode ? undefined : cancelPress}
          onTouchStart={selMode ? undefined : startPress}
          onTouchEnd={selMode ? undefined : cancelPress}
          onTouchCancel={selMode ? undefined : cancelPress}
          onContextMenu={(e) => {
            // 选择文本模式下放开浏览器原生右键菜单（方便直接用系统「复制」）
            if (selMode) return;
            e.preventDefault();
            openMenu(e.clientX, e.clientY);
          }}
        >
          {/* 昵称（非自己时显示） */}
          {!isSelf && (
            <span className="mb-1 px-1 font-medium" style={{ color: message.color, fontSize: `${auxSize}px` }}>
              {message.nickname}
            </span>
          )}

          <div
            className={`relative px-3.5 py-2 rounded-lg shadow-sm transition-opacity ${
              green
                ? 'bg-green-500 text-white rounded-br-md'
                : isSelf
                  ? isDarkMode
                    ? 'bg-gray-700 text-gray-100 rounded-br-md'
                    : 'bg-white text-gray-800 rounded-br-md'
                  : isDarkMode
                    ? 'bg-gray-700 text-gray-100 rounded-bl-md'
                    : 'bg-white text-gray-800 rounded-bl-md'
            } ${message.status === 'sending' ? 'opacity-60' : ''} ${message.status === 'failed' ? 'ring-2 ring-red-400' : ''}`}
            style={
              message.color_mark > 0
                ? {
                    boxShadow: `inset 0 0 0 2px ${
                      message.color_mark === 1
                        ? '#EF4444'
                        : message.color_mark === 2
                          ? '#F97316'
                          : message.color_mark === 6
                            ? '#FACC15'
                            : message.color_mark === 7
                              ? '#22C55E'
                              : message.color_mark === 3
                                ? '#3B82F6'
                                : message.color_mark === 5
                                  ? '#8B5CF6'
                                  : '#6B7280'
                    }, inset 0 0 0 4px rgba(255,255,255,0.9)`,
                  }
                : undefined
            }
          >
            {/* 徽章行：待办 + 记账，一行放得下就同行显示，放不下自动换行（flex-wrap，节省纵向空间） */}
            {(message.todo_status > 0 || money) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                {/* 待办标记：浅底深字徽章（与记账徽章同款公式），自带底色，绿泡/白泡/深色模式均可读 */}
                {message.todo_status > 0 && (
                  <div
                    className={`flex items-center gap-1 w-fit min-w-0 max-w-full rounded-md font-medium ${
                      message.todo_status === 2
                        ? 'text-green-700 bg-green-100 dark:text-green-200 dark:bg-green-900/60'
                        : 'text-amber-700 bg-amber-100 dark:text-amber-200 dark:bg-amber-900/60'
                    } ${todoOverdue ? 'pl-2 pr-0 py-0' : 'px-2 py-0.5'}`}
                    style={{ fontSize: `${auxSize}px` }}
                  >
                    {message.todo_status === 2 ? (
                      <CheckSquare className="w-3.5 h-3.5 flex-shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 flex-shrink-0" />
                    )}
                    <span>{message.todo_status === 1 ? '待办' : '已完成'}</span>
                    {/* 到点提醒：显示在「待办」右侧，方便一眼看到提醒时间；窄屏字号缩小避免长日期被裁断。
                        已到期且未完成 → 红底白字徽章（醒目），与外徽章右/上/下齐平（右侧圆角与外徽章一致）；未到期保持标签原配色 */}
                    {message.due_at && (
                      <span
                        className={`flex items-center gap-1.5 min-w-0 ml-1.5 ${
                          todoOverdue ? 'rounded-l rounded-r-md bg-red-600 px-1.5 py-0.5 text-white' : ''
                        }`}
                      >
                        <BellRing className="w-3 h-3 flex-shrink-0 opacity-90" />
                        <span className="truncate opacity-90">{message.due_at.slice(0, 16)}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* 记账徽章：支出/退款/收入/收入调减（退款与收入调减带「退」「减」标记，表示抵减而非新增） */}
                {money && (
                  <div
                    className={`flex items-center gap-1.5 w-fit min-w-0 max-w-full rounded-md px-2 py-0.5 font-medium ${money.cls}`}
                    style={{ fontSize: `${auxSize}px` }}
                    title={
                      money.label === '退款'
                        ? '退款：抵减本月支出（不计入收入）'
                        : money.label === '收入调减'
                          ? '收入调减：抵减本月收入'
                          : `本月${money.label}`
                    }
                  >
                    <Wallet className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{money.label}</span>
                    {money.marker && (
                      <span className={`rounded px-1 text-white ${money.markerCls}`}>{money.marker}</span>
                    )}
                    <span>{money.text}</span>
                    {message.amount_cat && <span className="opacity-80">· {message.amount_cat}</span>}
                    {/* 记账日期 ≠ 消息发送日（补账场景）：同一行显示，图标 + 完整日期 */}
                    {message.amount_date && message.amount_date !== message.created_at.slice(0, 10) && (
                      <span className="flex items-center gap-1 opacity-80" title={`补账：记账日 ${message.amount_date}`}>
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{message.amount_date}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 引用回复摘要 */}
            {message.reply && (
              <div
                className={`mb-1.5 pl-2 border-l-2 rounded-sm min-w-0 ${
                  green
                    ? 'border-green-200/80 text-green-100'
                    : isDarkMode
                      ? 'border-green-500 text-gray-400'
                      : 'border-green-500 text-gray-500'
                }`}
                style={{ fontSize: `${auxSize}px` }}
              >
                <p className="font-medium">{message.reply.nickname}</p>
                <p className="whitespace-pre-wrap break-words line-clamp-3 opacity-80">
                  {message.reply.deleted === 1
                    ? '原消息已删除'
                    : message.reply.type === 'text'
                      ? message.reply.content
                      : message.reply.type === 'image'
                        ? '[图片]'
                        : message.reply.type === 'file'
                          ? `[文件] ${message.reply.content}`
                          : '[聊天记录]'}
                </p>
              </div>
            )}

            {/* 文本（超过折叠字数阈值默认折叠 6 行，点击展开全文） */}
            {message.type === 'text' && message.content && (
              <>
                <p
                  className={`whitespace-pre-wrap break-all ${isLongText && !expanded && !selMode ? 'line-clamp-6' : ''}`}
                  style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}
                >
                  {message.content}
                </p>
                {isLongText && !selMode && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className={`mt-0.5 font-medium hover:underline ${green ? 'text-green-100' : 'text-green-600'}`}
                    style={{ fontSize: `${auxSize}px` }}
                  >
                    {expanded ? '收起' : '展开全文'}
                  </button>
                )}
              </>
            )}

            {/* 图片 */}
            {message.type === 'image' && message.file && (
              <img
                src={fileUrl(message.file.url)}
                alt={message.file.name}
                loading="lazy"
                onClick={openFile}
                className="max-w-full max-h-72 rounded-lg cursor-pointer object-cover"
              />
            )}

            {/* 文件 */}
            {message.type === 'file' && message.file && (
              <button
                onClick={openFile}
                className={`flex items-center space-x-3 max-w-xs ${green ? 'text-white' : isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}
              >
                <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${green ? 'bg-green-600/60' : 'bg-green-100'}`}>
                  <FileText className={`w-5 h-5 ${green ? 'text-white' : 'text-green-600'}`} />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-medium truncate">{message.file.name}</span>
                  <span className={`block ${green ? 'text-green-100' : 'text-gray-400'}`} style={{ fontSize: `${auxSize}px` }}>
                    {formatFileSize(message.file.size)}
                  </span>
                </span>
                <Download className="w-4 h-4 flex-shrink-0 opacity-70" />
              </button>
            )}

            {/* 合并转发卡片 */}
            {message.type === 'forward' && (
              <button onClick={() => setShowForward(true)} className="text-left max-w-full">
                <p
                  className={`text-sm font-medium pb-1 border-b ${
                    green ? 'border-green-400/50' : isDarkMode ? 'border-gray-600' : 'border-gray-100'
                  }`}
                >
                  {forwardPayload?.title || '聊天记录'}
                </p>
                <div className="py-1 space-y-0.5">
                  {(forwardPayload?.items ?? []).slice(0, 3).map((it, i) => (
                    <p key={i} className={`truncate ${green ? 'text-green-100' : 'text-gray-400'}`} style={{ fontSize: `${auxSize}px` }}>
                      {it.nickname}: {forwardItemPreview(it)}
                    </p>
                  ))}
                </div>
                <p className={`${green ? 'text-green-200' : 'text-gray-400'}`} style={{ fontSize: `${auxSize}px` }}>
                  共 {forwardPayload?.items.length ?? 0} 条 · 点击查看
                </p>
              </button>
            )}

            {/* 备注：待办备注 + 公共备注（全员）+ 我的备注（仅本人），竖条样式与引用一致 */}
            {/* 待办备注：样式与公共备注一致；绿底气泡上文字用黄色，白底气泡用与对方一致的深色可读配色 */}
            {message.todo_note && (
              <div
                className={`mt-1.5 pl-2 border-l-2 rounded-sm break-words ${
                  green
                    ? 'border-green-200/80 text-yellow-200'
                    : isDarkMode
                      ? 'border-blue-400 text-blue-300'
                      : 'border-blue-500 text-blue-600'
                }`}
                style={{ fontSize: `${auxSize}px` }}
              >
                <p className="font-medium">待办备注：</p>
                <p className="whitespace-pre-wrap break-words opacity-90">{message.todo_note}</p>
              </div>
            )}
            {message.note && (
              <div
                className={`mt-1.5 pl-2 border-l-2 rounded-sm break-words ${
                  green
                    ? 'border-green-200/80 text-[#F5F5F0]'
                    : isDarkMode
                      ? 'border-blue-400 text-blue-300'
                      : 'border-blue-500 text-blue-600'
                }`}
                style={{ fontSize: `${auxSize}px` }}
              >
                <p className="font-medium">公共备注：</p>
                <p className="whitespace-pre-wrap break-words opacity-90">{message.note}</p>
              </div>
            )}
            {privateNotes[message.id] && (
              <div
                className={`mt-1.5 pl-2 border-l-2 rounded-sm break-words ${
                  green
                    ? 'border-green-200/80 text-[#F5F5F0]'
                    : isDarkMode
                      ? 'border-gray-400 text-gray-400'
                      : 'border-gray-400 text-gray-500'
                }`}
                style={{ fontSize: `${auxSize}px` }}
              >
                <p className="font-medium">我的备注：</p>
                <p className="whitespace-pre-wrap break-words opacity-90">{privateNotes[message.id]}</p>
              </div>
            )}

            {/* 时间 + 状态 */}
            <div className={`flex items-center gap-1 mt-1 justify-end ${green ? 'text-green-100' : 'text-gray-400'}`}>
              {isPinned && <Pin className="w-3 h-3" />}
              {message.status === 'sending' && <Clock className="w-3 h-3" />}
              {message.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-300" />}
              {!message.status && isSelf && <CheckCheck className="w-3 h-3 opacity-70" />}
              {isSelf && isDm && !message.status && message.id > 0 && (
                <span style={smallStyle}>{peerRead ? '已读' : '未读'}</span>
              )}
              <span style={smallStyle}>{shortTime(message.created_at)}</span>
            </div>
          </div>

          {/* 文本选择模式提示：拖动选择文本后复制 */}
          {selMode && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>已开启文本选择，拖动选中后复制</span>
              <button
                onClick={() => setSelMode(false)}
                className="px-2 py-0.5 rounded-md bg-green-500 text-white text-sm hover:bg-green-600 flex-shrink-0"
              >
                完成
              </button>
            </div>
          )}
        </div>
        {isSelf && (
          <span onClick={() => onAvatarClick(message.user_id)} className="cursor-pointer flex-shrink-0" title="查看用户信息">
            <Avatar
              userId={message.user_id}
              nickname={message.nickname}
              color={message.color}
              avatarVer={message.avatar_ver ?? 0}
              size={36}
              className="ml-2 mt-0.5"
            />
          </span>
        )}
      </div>

      {showMenu && createPortal(
        <div
          ref={menuRef}
          className={`fixed z-[80] rounded-xl shadow-xl border py-1.5 min-w-[200px] max-h-[70vh] overflow-y-auto ${
            isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
          }`}
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <p className={`text-xs px-3 py-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>消息操作</p>

          {/* 除颜色标记外，所有操作项统一两列网格（节省菜单高度） */}
          <div className="grid grid-cols-2 gap-x-1">
            {message.type === 'text' && message.content && (
              <button onClick={() => copyText(false)} className={menuBtn}>
                <Copy className="w-4 h-4" />
                <span>复制</span>
              </button>
            )}
            {message.type === 'text' && message.content && (
              <button onClick={() => copyText(true)} className={menuBtn}>
                <Copy className="w-4 h-4" />
                <span>复制(带时间)</span>
              </button>
            )}
            {message.type === 'text' && message.content && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  setSelMode(true);
                }}
                className={menuBtn}
              >
                <TextSelect className="w-4 h-4" />
                <span>选择</span>
              </button>
            )}
            <button
              onClick={() => {
                setShowMenu(false);
                onEnterSelect(message);
              }}
              className={menuBtn}
            >
              <ListChecks className="w-4 h-4" />
              <span>多选</span>
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onStartReply(message);
              }}
              className={menuBtn}
            >
              <CornerUpLeft className="w-4 h-4" />
              <span>引用</span>
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onForwardSingle(message, false);
              }}
              className={menuBtn}
            >
              <Forward className="w-4 h-4" />
              <span>转发</span>
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onForwardSingle(message, true);
              }}
              className={menuBtn}
            >
              <Forward className="w-4 h-4" />
              <span>转发(带来源)</span>
            </button>
            {canManage && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onTogglePin(message);
                }}
                className={menuBtn}
              >
                <Pin className="w-4 h-4" />
                <span>{isPinned ? '取消置顶' : '置顶'}</span>
              </button>
            )}
            {message.type === 'text' && message.content && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onShareCard(message);
                }}
                className={menuBtn}
              >
                <ImageDown className="w-4 h-4" />
                <span>生成分享卡片</span>
              </button>
            )}
            {/* 记账：群主/副群主（或私聊）可直接记账；普通成员只能委托。未开启财务记账的会话不显示 */}
            {ledgerEnabled && canManage && onSetAmount && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onSetAmount(message);
                }}
                className={menuBtn}
              >
                <Wallet className="w-4 h-4 text-red-500" />
                <span>{message.amount_kind > 0 ? '修改金额' : '记账'}</span>
              </button>
            )}
            {ledgerEnabled && !canManage && onDelegateAmount && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onDelegateAmount(message);
                }}
                className={menuBtn}
              >
                <Wallet className="w-4 h-4 text-gray-400" />
                <span>委托记账</span>
              </button>
            )}
            {canRecall && (
              <button
                onClick={handleRecall}
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-gray-600"
              >
                <Undo2 className="w-4 h-4" />
                <span>撤回</span>
              </button>
            )}
            {canManage && message.todo_status === 0 && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onSetTodo(message, 1);
                }}
                className={menuBtn}
              >
                <Square className="w-4 h-4 text-amber-500" />
                <span>设为待办事项</span>
              </button>
            )}
            {canManage && message.todo_status === 1 && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onSetTodo(message, 2);
                }}
                className={menuBtn}
              >
                <CheckSquare className="w-4 h-4 text-green-500" />
                <span>标记为已完成</span>
              </button>
            )}
            {canManage && message.todo_status === 2 && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onSetTodo(message, 1);
                }}
                className={menuBtn}
              >
                <Square className="w-4 h-4 text-amber-500" />
                <span>恢复为待办</span>
              </button>
            )}
            {canManage && message.todo_status > 0 && (
              <button onClick={editNote} className={menuBtn}>
                <StickyNote className="w-4 h-4 text-amber-500" />
                <span>{message.todo_note ? '修改待办备注' : '添加待办备注'}</span>
              </button>
            )}
            {canManage && message.todo_status === 1 && onSetDue && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onSetDue(message);
                }}
                className={menuBtn}
              >
                <BellRing className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="break-all leading-tight">{message.due_at ? `提醒：${message.due_at.slice(0, 16)}` : '设置到点提醒'}</span>
              </button>
            )}
            {canManage && message.todo_status > 0 && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onSetTodo(message, 0);
                }}
                className={menuBtn}
              >
                <X className="w-4 h-4 text-amber-500" />
                <span>恢复为普通消息</span>
              </button>
            )}
            <button onClick={editMsgNote} className={menuBtn}>
              <StickyNote className="w-4 h-4" />
              <span>{message.note || privateNotes[message.id] ? '修改消息备注' : '添加消息备注'}</span>
            </button>
            {(message.type === 'image' || message.type === 'file') && message.file && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  openFile();
                }}
                className={menuBtn}
              >
                <Download className="w-4 h-4" />
                <span>{message.type === 'image' ? '查看大图' : '打开/下载文件'}</span>
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-gray-600"
              >
                <Trash2 className="w-4 h-4" />
                <span>删除</span>
              </button>
            )}
          </div>

          {/* 颜色标记（管理类操作：仅群主/副群主或私聊；普通成员/观察者隐藏入口） */}
          {canManage && (
            <>
              <div className={`my-1 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-100'}`} />
              <div className="px-3 py-1.5 flex items-center gap-2.5">
                <Palette className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                {COLOR_OPTS.map((o) => (
                  <button
                    key={o.color}
                    onClick={() => {
                      setShowMenu(false);
                      onSetColor(message, o.color);
                    }}
                    title={o.title}
                    className={`w-6 h-6 rounded-full ${o.bg} transition-transform flex-shrink-0 ${
                      message.color_mark === o.color
                        ? `ring-2 ring-blue-500 ring-offset-2 scale-110 ${isDarkMode ? 'ring-offset-gray-700' : 'ring-offset-white'}`
                        : 'ring-1 ring-black/10 hover:scale-110'
                    }`}
                  />
                ))}
              </div>
              {message.color_mark > 0 && (
                <button
                  onClick={() => { setShowMenu(false); onSetColor(message, 0); }}
                  className={menuBtn}
                >
                  <Palette className="w-4 h-4" />
                  <span>取消颜色标记</span>
                </button>
              )}
            </>
          )}

          {(message.type === 'image' || message.type === 'file') && message.file && (
            <button
              onClick={() => {
                setShowMenu(false);
                openFile();
              }}
              className={menuBtn}
            >
              <Download className="w-4 h-4" />
              <span>{message.type === 'image' ? '查看大图' : '打开/下载文件'}</span>
            </button>
          )}
        </div>,
        document.body,
      )}

      {showForward && forwardPayload && (
        <ForwardDetail payload={forwardPayload} isDarkMode={isDarkMode} onClose={() => setShowForward(false)} />
      )}

      {showNoteModal && (
        <NoteModal
          isDarkMode={isDarkMode}
          canPublic={isSelf || canManage}
          publicNote={message.note}
          privateNote={privateNotes[message.id] || ''}
          onSave={(note, scope) => onSetNote(message, note, scope)}
          onClose={() => setShowNoteModal(false)}
        />
      )}
    </>
  );
};
