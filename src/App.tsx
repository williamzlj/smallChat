﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Menu, X, Info, Hash, Search, ListTodo, Pin, MessageCircle, Flag, CheckCheck, Megaphone, ArrowLeft, Wallet, Banknote, ChevronDown, Check, ChevronsDown, History } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { AvatarCropModal } from './components/AvatarCropModal';
import { setCachedAvatar } from './api/avatarCache';
import { MessageList } from './components/MessageList';
import { InputBox } from './components/InputBox';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ProfileSettings } from './components/Auth/ProfileSettings';
import { CreateGroupModal } from './components/Group/CreateGroupModal';
import { GroupInfoModal } from './components/Group/GroupInfoModal';
import { FriendsPanel } from './components/FriendsPanel';
import { FriendDetail } from './components/FriendDetail';
import { SearchPanel } from './components/SearchPanel';
import { TodoNoteModal } from './components/TodoNoteModal';
import { ForwardModal } from './components/ForwardModal';
import { ShareCardModal } from './components/ShareCardModal';
import { TodoPanel } from './components/TodoPanel';
import { ImportantPanel } from './components/ImportantPanel';
import { DueEditor } from './components/DueEditor';
import { AmountEditor } from './components/AmountEditor';
import { LedgerSummary } from './components/LedgerSummary';
import { useAuth } from './hooks/useAuth';
import { useGroups } from './hooks/useGroups';
import { useChat } from './hooks/useChat';
import { api } from './api/client';
import { ChatMessage, Friend, GroupMember, ForwardPayload, AmountType } from './api/types';

const DARK_KEY = 'smallchat-dark';
const FONT_KEY = 'smallchat-fontsize';
const GROUP_KEY = 'smallchat-current-group';
const BUBBLE_KEY = 'smallchat-bubble-style'; // 我的气泡样式：green 经典绿底 / white 简洁白底（仅本设备）

type AuthMode = 'login' | 'register';
type View = 'chats' | 'friends' | 'todos' | 'important';

function previewOf(m: ChatMessage): string {
  if (m.type === 'image') return '[图片]';
  if (m.type === 'file') return `[文件] ${m.content}`;
  if (m.type === 'forward') return '[聊天记录]';
  return m.content;
}

export default function App() {
  const { user, isLoading, isAuthenticated, login, register, logout, updateProfile, setUserAvatarVer } = useAuth();

  // 带邀请码的注册链接（?code=xxx）打开时直接进注册页
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    try {
      return new URLSearchParams(window.location.search).get('code') ? 'register' : 'login';
    } catch {
      return 'login';
    }
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem(DARK_KEY) === '1');
  const [fontSize, setFontSize] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(FONT_KEY) || '16', 10);
    return Number.isFinite(v) ? Math.min(24, Math.max(14, v)) : 16;
  });
  // 我的气泡样式（仅本地保存，不上传服务器）
  const [bubbleStyle, setBubbleStyle] = useState<'green' | 'white'>(() =>
    localStorage.getItem(BUBBLE_KEY) === 'white' ? 'white' : 'green',
  );
  const [currentGroupId, setCurrentGroupId] = useState<number | null>(() => {
    const v = parseInt(localStorage.getItem(GROUP_KEY) || '', 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cropOpen, setCropOpen] = useState(false); // 头像裁剪弹窗

  // 二期功能状态
  const [view, setView] = useState<View>('chats');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [currentFriend, setCurrentFriend] = useState<Friend | null>(null);
  // 好友详情的返回目标：从聊天点头像进入→返回聊天；从好友列表进入→返回好友列表
  const [friendBackTo, setFriendBackTo] = useState<'chats' | 'list'>('list');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchScopeAll, setSearchScopeAll] = useState(false);
  // 搜索面板默认模式：侧栏搜索按钮=找群，聊天头部搜索按钮=搜消息
  const [searchMode, setSearchMode] = useState<'group' | 'message'>('group');
  const [forwardMsgs, setForwardMsgs] = useState<ChatMessage[] | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [todoOnly, setTodoOnly] = useState(false);
  const [showCompletedTodo, setShowCompletedTodo] = useState(false);
  const [importantOnly, setImportantOnly] = useState(false);
  // ===== 本设备设置（仅存 localStorage，不同步服务器）=====
  // 长文本默认折叠的字数阈值（0=不折叠），默认 240
  const [foldLen, setFoldLen] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('smallchat-fold-len') ?? '', 10);
    return Number.isFinite(v) && v >= 0 ? v : 240;
  });
  // 设为待办时是否弹出「待办备注窗口」（可快速输入预计时长），默认关闭
  const [todoNotePopup, setTodoNotePopup] = useState<boolean>(() => localStorage.getItem('smallchat-todo-note-popup') === '1');
  // 只看财务消息（带记账金额的消息）
  const [ledgerOnly, setLedgerOnly] = useState(false);
  // 时间跳转请求：ts=null 跳最新一条；否则跳到第一条 ≥ ts 的消息（如 3 天前回看）
  const [jumpRequest, setJumpRequest] = useState<{ ts: number | null; nonce: number } | null>(null);
  // 群头部下拉菜单开关
  const [headerMenu, setHeaderMenu] = useState(false);
  // 待办备注弹窗：设为待办（弹出开关开启时）或添加/修改待办备注时打开
  const [todoNoteEdit, setTodoNoteEdit] = useState<{ msg: ChatMessage; status: number } | null>(null);
  useEffect(() => {
    localStorage.setItem('smallchat-fold-len', String(foldLen));
  }, [foldLen]);
  useEffect(() => {
    localStorage.setItem('smallchat-todo-note-popup', todoNotePopup ? '1' : '0');
  }, [todoNotePopup]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<ChatMessage[]>([]);
  const [privateNotes, setPrivateNotes] = useState<Record<number, string>>({});
  // 已关闭公告横幅的群（会话内记忆）
  const [dismissedNotices, setDismissedNotices] = useState<Set<number>>(new Set());
  const [peerLastRead, setPeerLastRead] = useState(0);
  // 聊天区待办的到点提醒编辑（必须在提前 return 之前声明，遵守 Hooks 规则）
  const [dueEditId, setDueEditId] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMarkedRef = useRef(0);
  const [singleForwardMsg, setSingleForwardMsg] = useState<ChatMessage | null>(null);
  const [singleForwardWithSource, setSingleForwardWithSource] = useState(false);
  // 生成分享卡片的目标消息（非 null 时打开卡片预览弹窗）
  const [shareCardMsgs, setShareCardMsgs] = useState<ChatMessage[] | null>(null); // 分享卡片消息（单条=长度1数组，多选合成=多条）
  // 从待办/重要面板跳转到聊天时，记录来源面板以显示返回按钮
  const [backToPanel, setBackToPanel] = useState<'todos' | 'important' | null>(null);
  // 面板跳转携带的目标消息 id（非 null 时聊天页以该消息为中心加载并高亮定位）
  const [focusMsgId, setFocusMsgId] = useState<number | null>(null);
  // 撤回消息的「重新编辑」：内容只在本地记住（撤回时间起 5 分钟内显示链接，微信同款）
  const [recalledDrafts, setRecalledDrafts] = useState<Record<number, { content: string; at: number }>>({});
  const [reEditDraft, setReEditDraft] = useState<{ text: string } | null>(null);
  // 记账：正在编辑金额的消息 + 记账汇总弹窗开关（均在提前 return 之前声明）
  const [amountEditMsg, setAmountEditMsg] = useState<ChatMessage | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2000);
  }, []);

  useEffect(() => {
    const check = () => {
      // 布局分界 768px：侧栏并排 / 抽屉切换（头部图标另有单独的 580px 判定）
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarVisible(!mobile);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem(DARK_KEY, isDarkMode ? '1' : '0');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem(BUBBLE_KEY, bubbleStyle);
  }, [bubbleStyle]);

  useEffect(() => {
    if (currentGroupId) localStorage.setItem(GROUP_KEY, String(currentGroupId));
    else localStorage.removeItem(GROUP_KEY);
  }, [currentGroupId]);

  const { groups, loading: groupsLoading, create, refresh: refreshGroups } = useGroups();
  const currentGroup = useMemo(
    () => groups.find((g) => g.id === currentGroupId) || null,
    [groups, currentGroupId],
  );

  const {
    messages,
    setMessages,
    loading: msgLoading,
    loadingMore,
    hasMore,
    sending,
    uploadProgress,
    loadMore,
    sendText,
    sendFileMessage,
    deleteMessage,
    recallMessage,
    setTodoStatus,
    setColorStatus,
    highlightMsgId,
    setHighlightMsgId,
  } = useChat(isAuthenticated ? currentGroupId : null, user, focusMsgId);

  // 群列表刷新后，若当前群已不存在（被解散/退群），切到 null
  useEffect(() => {
    if (!groupsLoading && currentGroupId && !groups.some((g) => g.id === currentGroupId)) {
      setCurrentGroupId(null);
    }
  }, [groups, groupsLoading, currentGroupId]);

  // 切群时重置会话内状态 + 拉取成员列表（@提醒/邀请用）+ 置顶消息
  useEffect(() => {
    setReplyTo(null);
    setTodoOnly(false);
    setImportantOnly(false);
    setShowCompletedTodo(false);
    setLedgerOnly(false);
    setHeaderMenu(false);
    setJumpRequest(null);
    setPeerLastRead(0);
    lastMarkedRef.current = 0;
    setMembers([]);
    setPinnedMessages([]);
    setPrivateNotes({});
    if (currentGroupId) {
      api.groupsMembers(currentGroupId)
        .then((r) => setMembers(r.members))
        .catch(() => {});
      api.groupsPins(currentGroupId)
        .then((r) => setPinnedMessages(r.messages))
        .catch(() => {});
    }
  }, [currentGroupId]);

  // 消息变化后按需拉取私有备注（只拉还没有缓存的 id）
  useEffect(() => {
    const needFetch = messages.filter((m) => m.id > 0 && !(m.id in privateNotes)).map((m) => m.id);
    if (needFetch.length === 0) return;
    // 批量拉取，最多 200 个
    const batch = needFetch.slice(0, 200);
    api.messagesGetNotes(batch)
      .then((r) => {
        if (Object.keys(r.notes).length > 0) {
          setPrivateNotes((prev) => ({ ...prev, ...r.notes }));
        }
      })
      .catch(() => {});
  }, [messages]);

  // 新消息到达：上报已读位置
  useEffect(() => {
    if (!currentGroup || !user || currentGroup.is_archived === 1) return;
    const maxId = messages.reduce((mx, m) => Math.max(mx, m.id), 0);
    if (maxId > lastMarkedRef.current && !document.hidden) {
      lastMarkedRef.current = maxId;
      api.readMark(currentGroup.id, maxId).catch(() => {});
    }
  }, [messages, currentGroup, user]);

  // 私聊：轮询对方已读位置
  const isDmGroup = currentGroup?.is_dm === 1;
  useEffect(() => {
    if (!currentGroup || !isDmGroup || !user) return;
    let stopped = false;
    const gid = currentGroup.id;
    const tick = async () => {
      try {
        const { readers } = await api.readStatus(gid);
        if (stopped) return;
        const peer = readers.find((r) => r.user_id !== user.id);
        setPeerLastRead(peer?.last_read_msg_id ?? 0);
      } catch {
        // 网络波动忽略
      }
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [currentGroup, isDmGroup, user]);

  // 好友列表
  const loadFriends = useCallback(async () => {
    try {
      const { friends: list } = await api.friendsList();
      setFriends(list);
    } catch {
      // 静默失败
    }
  }, []);
  useEffect(() => {
    if (isAuthenticated) void loadFriends();
  }, [isAuthenticated, loadFriends]);

  // 置顶消息列表（最多3条）
  const pinnedMsgIds = pinnedMessages.map((m) => m.id);

  // 当前用户在当前群的有效角色（后端 groups.list 返回 my_role；缺失时按 owner_id/成员表兜底）
  const myRole = useMemo<'owner' | 'admin' | 'member' | 'observer'>(() => {
    if (!currentGroup || !user) return 'member';
    if (currentGroup.my_role) return currentGroup.my_role;
    if (currentGroup.is_dm === 1) return 'member';
    if (currentGroup.owner_id === user.id) return 'owner';
    return members.some((m) => m.id === user.id && m.is_admin === 1) ? 'admin' : 'member';
  }, [currentGroup, user, members]);

  // 群聊管理能力（置顶/待办/重要/公共备注/删除消息等）：私聊豁免，群聊需群主/副群主
  const canManage = currentGroup?.is_dm === 1 || myRole === 'owner' || myRole === 'admin';

  // 财务记账能力：私聊恒可用（后端 groups.list 已把私聊置 1），群聊需在群设置里开启；未开启则隐藏全部记账入口
  const ledgerEnabled = currentGroup?.ledger_enabled === 1;

  // 群 id → 本人在该群的角色（待办/重要面板按条目所在群判定操作权限）
  const roleOf = useCallback((gid: number) => groups.find((g) => g.id === gid)?.my_role, [groups]);

  // 记账弹窗的预填：已有金额→按原值编辑；新记账且回复了原记账消息→自动按「退款/收入调减」并继承原分类
  // 注意：必须放在下方 isLoading / 未登录的提前 return 之前，否则登录状态变化会导致 Hook 数量变化（Rules of Hooks）
  const amountPrefill = useMemo<{ type: AmountType; category: string; hint: string }>(() => {
    const msg = amountEditMsg;
    if (!msg) return { type: 'expense', category: '', hint: '' };
    const k = msg.amount_kind;
    const c = msg.amount_cents;
    if (k > 0 && c !== null && c !== 0) {
      const type: AmountType = k === 1 ? (c > 0 ? 'expense' : 'refund') : c > 0 ? 'income' : 'incomeRev';
      return { type, category: msg.amount_cat, hint: '' };
    }
    if (msg.reply_to) {
      const orig = messages.find((m) => m.id === msg.reply_to);
      if (orig && orig.amount_kind > 0) {
        const isExpense = orig.amount_kind === 1;
        return {
          type: isExpense ? 'refund' : 'incomeRev',
          category: orig.amount_cat,
          hint: orig.amount_cat ? orig.amount_cat : '（原消息未分类）',
        };
      }
    }
    return { type: 'expense', category: '', hint: '' };
  }, [amountEditMsg, messages]);

  // 以下函数（含 useCallback）必须放在启动屏 isLoading return 之前，避免 Hook 数量不一致
  // 添加/修改待办备注（消息菜单）：打开待办备注弹窗（保持原待办状态）
  const handleTodoNoteEdit = useCallback((msg: ChatMessage) => {
    setTodoNoteEdit({ msg, status: msg.todo_status > 0 ? msg.todo_status : 1 });
  }, []);

  // 群头部下拉菜单项（普通函数，引用 state 故也放顶部）
  const headerMenuItem = (icon: React.ReactNode, label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      onClick={() => {
        setHeaderMenu(false);
        onClick();
      }}
      className={`w-full flex items-center justify-between gap-3 px-3.5 py-2 text-sm text-left transition-colors ${
        isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <span className="flex items-center gap-2.5">
        {icon}
        <span>{label}</span>
      </span>
      {active && <Check className="w-4 h-4 text-green-500 flex-shrink-0" />}
    </button>
  );

  // 头部常用功能图标按钮：≥580px 直接展开（独立于 768px 的布局分界）
  const headerIconBtn = (
    icon: React.ReactNode,
    title: string,
    active: boolean,
    onClick: () => void,
    activeColor = 'text-green-500',
  ) => (
    <button
      onClick={onClick}
      title={title}
      className={`relative p-2 rounded-lg transition-colors ${
        active
          ? `${isDarkMode ? 'bg-gray-700' : 'bg-green-50'} ${activeColor}`
          : isDarkMode
            ? 'text-gray-400 hover:bg-gray-700'
            : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {icon}
      {active && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />}
    </button>
  );

  // 启动屏
  if (isLoading) {
    return (
      <div className="min-h-app flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="flex flex-col items-center text-gray-400">
          <Hash className="w-10 h-10 text-green-500 mb-3" />
          <p className="text-sm">smallChat</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return authMode === 'login' ? (
      <Login onLogin={login} onSwitchToRegister={() => setAuthMode('register')} />
    ) : (
      <Register onRegister={register} onSwitchToLogin={() => setAuthMode('login')} />
    );
  }

  const selectGroup = (id: number) => {
    setView('chats');
    setCurrentGroupId(id);
    setFocusMsgId(null);
    if (isMobile) setSidebarVisible(false);
    // 打开群后稍等已读上报完成，刷新群列表以清除未读徽章
    setTimeout(() => void refreshGroups(), 1500);
  };

  const handleCreateGroup = async (name: string) => {
    const id = await create(name);
    setCurrentGroupId(id);
  };

  // 发送文本（带引用 + @提醒）
  const handleSendText = async (content: string) => {
    const mentions = members
      .filter((mb) => mb.id !== user.id && content.includes(`@${mb.nickname}`))
      .map((mb) => mb.id);
    await sendText(content, { replyTo, mentions });
    setReplyTo(null);
  };

  const handleSetTodo = async (msg: ChatMessage, status: number, note?: string) => {
    // 开启「弹出待办备注窗口」后，设为待办先弹窗填备注/预计时长，保存时才真正提交
    if (status === 1 && todoNotePopup && note === undefined) {
      setTodoNoteEdit({ msg, status });
      return;
    }
    try {
      await setTodoStatus(msg.id, status, note);
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  // 待办备注弹窗保存：设为待办时提交状态+备注；添加/修改备注时保持原状态
  const handleTodoNoteSave = async (note: string) => {
    const cur = todoNoteEdit;
    if (!cur) return;
    setTodoNoteEdit(null);
    try {
      await setTodoStatus(cur.msg.id, cur.status, note);
      showToast(cur.msg.todo_status === 0 ? '已设为待办' : '待办备注已保存');
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  // 待办备注弹窗里点「设置提醒」：先保存备注（设为待办时一并提交状态），再打开到点提醒编辑
  const handleTodoNoteSetDue = async (note: string) => {
    const cur = todoNoteEdit;
    if (!cur) return;
    setTodoNoteEdit(null);
    try {
      await setTodoStatus(cur.msg.id, cur.status, note);
      setDueEditId(cur.msg.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  // 聊天区待办的到点提醒编辑（dueEditId 的 useState 在组件顶部统一声明）
  const dueEditMsg = dueEditId != null ? messages.find((m) => m.id === dueEditId) ?? null : null;
  const handleSaveDue = async (id: number, dueAt: string | null) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, due_at: dueAt } : m)));
    showToast(dueAt ? '提醒已设置' : '提醒已清除');
  };

  const handleSetColor = async (msg: ChatMessage, color: number) => {
    try {
      await setColorStatus(msg.id, color);
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  // 记账保存/清除后本地同步（不整体刷新消息列表）
  const handleAmountSaved = (kind: number, cents: number | null, category: string, amount_date: string | null) => {
    const id = amountEditMsg?.id;
    setAmountEditMsg(null);
    if (id == null) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, amount_kind: kind, amount_cents: cents, amount_cat: category, amount_date } : m,
      ),
    );
    showToast(kind === 0 ? '已清除记账' : '已记账');
  };

  const handleSetNote = async (msg: ChatMessage, note: string, scope: 'private' | 'public') => {
    try {
      await api.messagesSetNote(msg.id, note, scope);
      if (scope === 'private') {
        setPrivateNotes((prev) => {
          const next = { ...prev };
          if (note) next[msg.id] = note;
          else delete next[msg.id];
          return next;
        });
      } else {
        // 公共备注需要刷新消息列表
        // 简化处理：直接修改本地 state
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, note } : m)));
      }
      showToast(note ? '备注已保存' : '备注已清除');
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleTogglePin = async (msg: ChatMessage) => {
    if (!currentGroup) return;
    try {
      await api.groupsPin(currentGroup.id, msg.id);
      const { messages: list } = await api.groupsPins(currentGroup.id);
      setPinnedMessages(list);
      showToast(pinnedMsgIds.includes(msg.id) ? '已取消置顶' : '已置顶');
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleUnpin = async (msgId: number) => {
    if (!currentGroup) return;
    try {
      await api.groupsPin(currentGroup.id, msgId);
      const { messages: list } = await api.groupsPins(currentGroup.id);
      setPinnedMessages(list);
      showToast('已取消置顶');
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  // 合并转发到目标群
  const handleForward = async (targetGroupId: number) => {
    if (!forwardMsgs || forwardMsgs.length === 0) return;
    const senders = Array.from(new Set(forwardMsgs.map((m) => m.nickname)));
    const title =
      senders.length <= 2 ? `${senders.join('、')}的聊天记录` : `${senders.slice(0, 2).join('、')}等人的聊天记录`;
    const payload: ForwardPayload = {
      title,
      items: forwardMsgs.slice(0, 100).map((m) => ({
        nickname: m.nickname,
        color: m.color,
        type: m.type,
        content: m.type === 'image' ? '' : m.content,
        file: m.file,
        created_at: m.created_at,
      })),
    };
    await api.messagesSend({ group_id: targetGroupId, type: 'forward', content: JSON.stringify(payload) });
    setForwardMsgs(null);
    showToast('已合并转发');
  };

  // 单条转发到目标群（微信式：按原消息类型发送，图片/文件复用 file_id 原样转发）
  const handleForwardSingle = async (targetGroupId: number) => {
    const m = singleForwardMsg;
    if (!m) return;
    // 带来源转发：在消息文本后追加来源信息（参考日历备注格式，避免影响提醒展示）
    const sourceText = singleForwardWithSource
      ? `\n\n来自 ${currentGroup?.name ?? '未知群'} · ${m.nickname} · 发布于 ${m.created_at.slice(0, 16)}`
      : '';
    if (m.type === 'forward') {
      // 合并转发消息：原 JSON 内容重发
      await api.messagesSend({ group_id: targetGroupId, type: 'forward', content: m.content });
    } else if (m.type === 'image' || m.type === 'file') {
      if (!m.file) return;
      await api.messagesSend({ group_id: targetGroupId, type: m.type, content: m.content + sourceText, file_id: m.file.id });
    } else {
      await api.messagesSend({ group_id: targetGroupId, type: 'text', content: m.content + sourceText });
    }
    setSingleForwardMsg(null);
    setSingleForwardWithSource(false);
    showToast('已转发');
  };

  // 搜索结果跳转：带消息 id 时定位并高亮该条（与待办/重要面板一致），否则仅切群
  const handleSearchJump = (gid: number, msgId?: number) => {
    setSearchOpen(false);
    if (msgId) {
      handlePanelJump(gid, msgId);
      return;
    }
    if (gid !== currentGroupId) selectGroup(gid);
  };

  // 面板「委托」/消息「委托记账」：切到该条目所在群会话，并把委托文案预填进输入框（复用 reEditDraft 机制）
  const handleDelegate = async (groupId: number, summary: string, kind: 'todo' | 'important' | 'amount') => {
    let manager = '';
    try {
      const { members: list } = await api.groupsMembers(groupId);
      const pick = list.find((m) => m.is_owner === 1) ?? list.find((m) => m.is_admin === 1);
      manager = pick?.nickname ?? '';
    } catch {
      // 静默：取不到昵称时用通用称呼
    }
    const action =
      kind === 'todo' ? '请把这条消息设为待办' : kind === 'important' ? '请把这条消息标记为重要' : '请给这条消息记一笔账';
    const text = `@${manager || '群主'} ${action}：${summary}`;
    setBackToPanel(view === 'todos' || view === 'important' ? view : null);
    setView('chats');
    setCurrentGroupId(groupId);
    setFocusMsgId(null);
    setReEditDraft({ text });
    if (isMobile) setSidebarVisible(false);
  };

  // 从待办/重要面板跳转到聊天：总是切到聊天视图，并记录来源以便返回；携带消息 id 定位高亮
  const handlePanelJump = (gid: number, msgId: number) => {
    setBackToPanel(view === 'todos' || view === 'important' ? view : null);
    setView('chats');
    setCurrentGroupId(gid);
    setFocusMsgId(msgId);
    if (isMobile) setSidebarVisible(false);
    setTimeout(() => void refreshGroups(), 1500);
  };

  const handleBackToPanel = () => {
    if (!backToPanel) return;
    setView(backToPanel);
    setBackToPanel(null);
    setFocusMsgId(null);
  };

  // 好友详情页返回：从聊天来→回聊天；从好友列表来→清空选中（显示好友列表）
  const handleBackFromFriend = () => {
    if (friendBackTo === 'chats') {
      setView('chats');
    } else {
      setCurrentFriend(null);
      if (isMobile) setSidebarVisible(true);
    }
  };

  const addFriend = async (username: string) => {
    await api.friendsAdd(username);
    await loadFriends();
  };

  const removeFriend = async (f: Friend) => {
    if (!confirm(`确定删除好友「${f.nickname}」吗？（不会删除聊天记录）`)) return;
    try {
      await api.friendsRemove(f.id);
      setCurrentFriend(null);
      await loadFriends();
      showToast('已删除好友');
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const openDm = async (f: Friend) => {
    try {
      const { id } = await api.dmGetOrCreate(f.id);
      await refreshGroups();
      selectGroup(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : '发起私聊失败');
    }
  };

  // 好友资料（备注名/备忘）本地同步
  const handleFriendUpdated = (friendId: number, patch: { alias?: string; memo?: string }) => {
    setFriends((prev) => prev.map((f) => (f.id === friendId ? { ...f, ...patch } : f)));
    setCurrentFriend((prev) => (prev && prev.id === friendId ? { ...prev, ...patch } : prev));
  };

  // 聊天区点头像：自己→设置；好友→好友详情；非好友→询问添加
  const handleAvatarClick = async (userId: number) => {
    if (userId === user.id) {
      setShowSettings(true);
      return;
    }
    const f = friends.find((x) => x.id === userId);
    if (f) {
      setCurrentFriend(f);
      setFriendBackTo('chats');
      setView('friends');
      if (isMobile) setSidebarVisible(false);
      return;
    }
    const m = members.find((x) => x.id === userId);
    if (!m) return;
    if (!confirm(`「${m.nickname}」还不是你的好友，要添加为好友吗？`)) return;
    try {
      await api.friendsAdd(m.username);
      const { friends: list } = await api.friendsList();
      setFriends(list);
      const nf = list.find((x) => x.id === userId);
      if (nf) {
        setCurrentFriend(nf);
        setFriendBackTo('chats');
        setView('friends');
        if (isMobile) setSidebarVisible(false);
      }
      showToast('已添加好友');
    } catch (e) {
      alert(e instanceof Error ? e.message : '添加好友失败');
    }
  };

  const groupTitle = currentGroup
    ? currentGroup.is_dm === 1 && currentGroup.dm_peer
      ? currentGroup.dm_peer.nickname
      : currentGroup.name
    : '';

  return (
    <div className={`flex h-app overflow-hidden ${isDarkMode ? 'dark bg-gray-900' : 'bg-gray-100'}`}>
      {/* 侧边栏：桌面常驻 / 移动抽屉 */}
      {(sidebarVisible || !isMobile) && (
        <div
          className={`fixed md:static inset-y-0 left-0 z-40 transform transition-transform duration-300 md:translate-x-0 ${
            sidebarVisible ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {view === 'chats' || view === 'todos' || view === 'important' ? (
            <Sidebar
              user={user}
              groups={groups}
              currentGroupId={currentGroupId}
              view={view}
              onSelectGroup={selectGroup}
              onCreateGroup={() => setShowCreateGroup(true)}
              onOpenSettings={() => {
                setShowSettings(true);
                if (isMobile) setSidebarVisible(false);
              }}
              onSwitchView={(v) => {
                setView(v);
                // 移动端：切到好友视图先显示好友列表；其他视图主面板头部有菜单按钮可打开侧栏
                if (isMobile) setSidebarVisible(v === 'friends');
              }}
              onOpenSearch={() => {
                // 侧栏搜索按钮：默认「找群」（百群时定位会话）；面板内可切到搜消息
                setSearchMode('group');
                setSearchScopeAll(true);
                setSearchOpen(true);
                if (isMobile) setSidebarVisible(false);
              }}
              onChangeAvatar={() => setCropOpen(true)}
              onTogglePin={(groupId, pinned) => {
                void api.groupsSetPin(groupId, pinned).then(() => refreshGroups());
              }}
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            />
          ) : (
            <FriendsPanel
              friends={friends}
              currentFriendId={currentFriend?.id ?? null}
              onSelectFriend={(f) => {
                setCurrentFriend(f);
                setFriendBackTo('list');
                if (isMobile) setSidebarVisible(false);
              }}
              onAdd={addFriend}
              onBack={() => setView('chats')}
              isDarkMode={isDarkMode}
            />
          )}
        </div>
      )}

      {sidebarVisible && isMobile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setSidebarVisible(false)}
        />
      )}

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0 w-full md:w-auto">
        {/* 待办/重要面板常驻挂载：切到聊天再返回时保持筛选条件、列表数据与滚动位置 */}
        <div className={`flex-1 flex flex-col min-h-0 ${view === 'todos' ? '' : 'hidden'}`}>
          <TodoPanel
            isDarkMode={isDarkMode}
            fontSize={fontSize}
            currentUserId={user.id}
            onJump={handlePanelJump}
            onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
            sidebarOpen={sidebarVisible}
            active={view === 'todos'}
            roleOf={roleOf}
            onDelegate={(gid, summary, kind) => void handleDelegate(gid, summary, kind)}
          />
        </div>
        <div className={`flex-1 flex flex-col min-h-0 ${view === 'important' ? '' : 'hidden'}`}>
          <ImportantPanel
            isDarkMode={isDarkMode}
            fontSize={fontSize}
            onJump={handlePanelJump}
            onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
            sidebarOpen={sidebarVisible}
            active={view === 'important'}
            roleOf={roleOf}
            onDelegate={(gid, summary, kind) => void handleDelegate(gid, summary, kind)}
          />
        </div>
        {view !== 'todos' && view !== 'important' && (view === 'friends' ? (
          // 好友详情
          currentFriend ? (
            <FriendDetail
              friend={currentFriend}
              isDarkMode={isDarkMode}
              sidebarOpen={sidebarVisible}
              onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
              onSendMessage={(f) => void openDm(f)}
              onRemove={(f) => void removeFriend(f)}
              onJumpGroup={selectGroup}
              onUpdated={handleFriendUpdated}
              onBack={handleBackFromFriend}
            />
          ) : (
            <>
              <div
                className={`border-b px-2 sm:px-4 py-2.5 flex items-center flex-shrink-0 ${
                  isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                }`}
              >
                <button
                  onClick={() => setSidebarVisible(!sidebarVisible)}
                  className={`p-1.5 rounded-lg md:hidden flex-shrink-0 ${
                    isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {sidebarVisible ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
                <h2 className={`text-base font-semibold ml-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>好友</h2>
              </div>
              <div className={`flex-1 flex flex-col items-center justify-center ${isDarkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
                <MessageCircle className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-sm">从左侧选择一位好友，或添加新好友</p>
              </div>
            </>
          )
        ) : currentGroup ? (
          <div key={currentGroup.id} className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* 群头部 */}
            <div
              className={`border-b px-2 sm:px-4 py-2.5 flex items-center justify-between flex-shrink-0 ${
                isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center space-x-2 min-w-0">
                {backToPanel && (
                  <button
                    onClick={handleBackToPanel}
                    className={`p-1.5 rounded-lg flex-shrink-0 ${
                      isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    title={backToPanel === 'todos' ? '返回待办列表' : '返回重要事项列表'}
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => setSidebarVisible(!sidebarVisible)}
                  className={`p-1.5 rounded-lg md:hidden flex-shrink-0 ${
                    isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {sidebarVisible ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
                <div className="min-w-0" onDoubleClick={() => setJumpRequest({ ts: null, nonce: Date.now() })} title="双击跳到最新消息">
                  <h2 className={`text-base font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                    {groupTitle}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {currentGroup.is_dm === 1 ? '私聊' : `${currentGroup.member_count} 位成员`}
                    {currentGroup.is_archived === 1 && ' · 已停用'}
                  </p>
                </div>
              </div>
              <div className="flex items-center flex-shrink-0">
                {/* 头部图标独立断点：≥580 展开为图标按钮（与布局分界 768 解耦） */}
                <div className="hidden min-[580px]:flex items-center gap-0.5 mr-1">
                  {headerIconBtn(
                    <ListTodo className="w-5 h-5" />,
                    todoOnly ? '退出只看待办' : '只看待办',
                    todoOnly,
                    () => {
                      setTodoOnly(!todoOnly);
                      if (todoOnly) return;
                      setImportantOnly(false);
                      setLedgerOnly(false);
                    },
                    'text-amber-500',
                  )}
                  {todoOnly &&
                    headerIconBtn(
                      <CheckCheck className="w-5 h-5" />,
                      showCompletedTodo ? '隐藏已完成待办' : '同时显示已完成待办',
                      showCompletedTodo,
                      () => setShowCompletedTodo(!showCompletedTodo),
                      'text-green-500',
                    )}
                  {headerIconBtn(
                    <Flag className="w-5 h-5" />,
                    importantOnly ? '退出只看重要' : '只看重要消息',
                    importantOnly,
                    () => {
                      setImportantOnly(!importantOnly);
                      if (importantOnly) return;
                      setTodoOnly(false);
                      setLedgerOnly(false);
                    },
                    'text-red-500',
                  )}
                  {ledgerEnabled &&
                    headerIconBtn(
                      <Banknote className="w-5 h-5" />,
                      ledgerOnly ? '退出只看财务' : '只看财务消息',
                      ledgerOnly,
                      () => {
                        setLedgerOnly(!ledgerOnly);
                        if (ledgerOnly) return;
                        setTodoOnly(false);
                        setImportantOnly(false);
                      },
                      'text-rose-500',
                    )}
                  <div className={`w-px h-5 mx-1 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                  {headerIconBtn(
                    <ChevronsDown className="w-5 h-5" />,
                    '跳到最新消息',
                    false,
                    () => setJumpRequest({ ts: null, nonce: Date.now() }),
                    'text-green-500',
                  )}
                  {headerIconBtn(
                    <History className="w-5 h-5" />,
                    '回看3天前的消息',
                    false,
                    () => {
                      const d = new Date();
                      d.setDate(d.getDate() - 3);
                      d.setHours(0, 0, 0, 0);
                      setJumpRequest({ ts: d.getTime(), nonce: Date.now() });
                    },
                    'text-blue-500',
                  )}
                  {ledgerEnabled &&
                    headerIconBtn(
                      <Wallet className="w-5 h-5" />,
                      '记账 / 开支汇总',
                      false,
                      () => setLedgerOpen(true),
                      'text-rose-500',
                    )}
                  {headerIconBtn(
                    <Search className="w-5 h-5" />,
                    '搜索聊天记录',
                    false,
                    () => {
                      setSearchMode('message');
                      setSearchScopeAll(false);
                      setSearchOpen(true);
                    },
                    'text-green-500',
                  )}
                </div>

                {/* 与上面图标按钮同一断点：<580 才收纳为下拉菜单 */}
                <div className="relative min-[580px]:hidden">
                  <button
                    onClick={() => setHeaderMenu((v) => !v)}
                    className={`relative p-2 rounded-lg ${
                      isDarkMode
                        ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700'
                        : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                    }`}
                    title="更多功能（待办/重要/财务/搜索等）"
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform ${headerMenu ? 'rotate-180' : ''}`} />
                    {(todoOnly || importantOnly || ledgerOnly) && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </button>
                  {headerMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setHeaderMenu(false)} />
                      <div
                        className={`absolute right-0 top-full mt-1 z-50 rounded-xl shadow-xl border py-1.5 min-w-[200px] ${
                          isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                        }`}
                      >
                        {headerMenuItem(
                          <ListTodo className="w-4 h-4 text-amber-500" />,
                          '只看待办',
                          todoOnly,
                          () => {
                            setTodoOnly(!todoOnly);
                            if (!todoOnly) setImportantOnly(false);
                            if (!todoOnly) setLedgerOnly(false);
                          },
                        )}
                        {todoOnly &&
                          headerMenuItem(
                            <CheckCheck className="w-4 h-4 text-green-500" />,
                            showCompletedTodo ? '隐藏已完成待办' : '同时显示已完成待办',
                            showCompletedTodo,
                            () => setShowCompletedTodo(!showCompletedTodo),
                          )}
                        {headerMenuItem(
                          <Flag className="w-4 h-4 text-red-500" />,
                          '只看重要消息',
                          importantOnly,
                          () => {
                            setImportantOnly(!importantOnly);
                            if (!importantOnly) setTodoOnly(false);
                            if (!importantOnly) setLedgerOnly(false);
                          },
                        )}
                        {ledgerEnabled &&
                          headerMenuItem(
                            <Banknote className="w-4 h-4 text-rose-500" />,
                            '只看财务消息',
                            ledgerOnly,
                            () => {
                              setLedgerOnly(!ledgerOnly);
                              if (!ledgerOnly) setTodoOnly(false);
                              if (!ledgerOnly) setImportantOnly(false);
                            },
                          )}
                        <div className={`my-1.5 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`} />
                        {headerMenuItem(<ChevronsDown className="w-4 h-4 text-green-500" />, '跳到最新消息', false, () =>
                          setJumpRequest({ ts: null, nonce: Date.now() }),
                        )}
                        {headerMenuItem(
                          <History className="w-4 h-4 text-blue-500" />,
                          '回看3天前的消息',
                          false,
                          () => {
                            const d = new Date();
                            d.setDate(d.getDate() - 3);
                            d.setHours(0, 0, 0, 0); // 从3天前的当天 0 点开始阅读
                            setJumpRequest({ ts: d.getTime(), nonce: Date.now() });
                          },
                        )}
                        <div className={`my-1.5 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`} />
                        {ledgerEnabled &&
                          headerMenuItem(<Wallet className="w-4 h-4 text-rose-500" />, '记账 / 开支汇总', false, () => setLedgerOpen(true))}
                        {headerMenuItem(
                          <Search className="w-4 h-4 text-green-500" />,
                          '搜索聊天记录',
                          false,
                          () => {
                            setSearchMode('message');
                            setSearchScopeAll(false);
                            setSearchOpen(true);
                          },
                        )}
                      </div>
                    </>
                  )}
                </div>
                {/* 群聊信息（Info 图标）单独显示，不收纳进下拉菜单 */}
                <button
                  onClick={() => {
                    setHeaderMenu(false);
                    setShowGroupInfo(true);
                  }}
                  className={`p-2 rounded-lg ${
                    isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                  }`}
                  title={currentGroup.is_dm === 1 ? '聊天信息' : '群聊信息'}
                >
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 群公告横幅 */}
            {currentGroup.is_dm !== 1 && currentGroup.announcement && !dismissedNotices.has(currentGroup.id) && (
              <div
                className={`px-3 py-1.5 border-b flex-shrink-0 flex items-center space-x-2 text-sm ${
                  isDarkMode ? 'bg-amber-900/30 border-gray-700 text-amber-200' : 'bg-amber-50 border-amber-100 text-amber-800'
                }`}
              >
                <Megaphone className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 truncate" title={currentGroup.announcement}>
                  群公告：{currentGroup.announcement}
                </span>
                <button
                  onClick={() => setDismissedNotices((prev) => new Set(prev).add(currentGroup.id))}
                  className="p-0.5 rounded flex-shrink-0 hover:text-red-500"
                  title="关闭"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* 置顶横幅（最多3条） */}
            {pinnedMessages.length > 0 && (
              <div
                className={`px-3 py-1.5 border-b flex-shrink-0 ${
                  isDarkMode ? 'bg-gray-800/80 border-gray-700 text-gray-300' : 'bg-amber-50 border-amber-100 text-amber-800'
                }`}
              >
                {pinnedMessages.map((p, idx) => (
                  <div key={p.id} className="flex items-center space-x-2 text-sm py-0.5">
                    {idx === 0 && <Pin className="w-3.5 h-3.5 flex-shrink-0" />}
                    {idx > 0 && <span className="w-3.5 flex-shrink-0" />}
                    <span className="flex-1 truncate">
                      {p.nickname}：{previewOf(p)}
                    </span>
                    <button
                      onClick={() => void handleUnpin(p.id)}
                      className="p-0.5 rounded flex-shrink-0 hover:text-red-500"
                      title="取消置顶"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <MessageList
              messages={messages}
              currentUserId={user.id}
              ownerId={currentGroup.owner_id}
              canManage={canManage}
              loading={msgLoading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              todoOnly={todoOnly}
              showCompletedTodo={showCompletedTodo}
              importantOnly={importantOnly}
              ledgerOnly={ledgerOnly}
              pinnedMsgIds={pinnedMsgIds}
              isDm={currentGroup.is_dm === 1}
              peerLastReadId={peerLastRead}
              onLoadMore={loadMore}
              onDeleteMessage={deleteMessage}
              onRecallMessage={recallMessage}
              recalledDrafts={recalledDrafts}
              onReEditRecord={(id, content) =>
                setRecalledDrafts((p) => ({ ...p, [id]: { content, at: Date.now() } }))
              }
              onReEdit={(id, text) => {
                setRecalledDrafts((p) => {
                  const n = { ...p };
                  delete n[id];
                  return n;
                });
                setReEditDraft({ text });
              }}
              onForwardSingle={(m, withSource) => {
                setSingleForwardMsg(m);
                setSingleForwardWithSource(!!withSource);
              }}
              onSetTodo={(m, s, n) => void handleSetTodo(m, s, n)}
              onSetDue={(m) => setDueEditId(m.id)}
              onSetColor={(m, c) => void handleSetColor(m, c)}
              onSetAmount={(m) => setAmountEditMsg(m)}
              onDelegateAmount={(m) => void handleDelegate(m.group_id, previewOf(m).slice(0, 30), 'amount')}
              ledgerEnabled={ledgerEnabled}
              onSetNote={(m, n, s) => handleSetNote(m, n, s)}
              privateNotes={privateNotes}
              onAvatarClick={(uid) => void handleAvatarClick(uid)}
              onStartReply={setReplyTo}
              onTogglePin={(m) => void handleTogglePin(m)}
              onShareCard={(m) => setShareCardMsgs([m])}
              onShareCardMulti={setShareCardMsgs}
              onForwardMessages={setForwardMsgs}
              onTodoNoteEdit={handleTodoNoteEdit}
              foldLen={foldLen}
              jumpRequest={jumpRequest}
              onJumpDone={() => setJumpRequest(null)}
              isDarkMode={isDarkMode}
              fontSize={fontSize}
              bubbleStyle={bubbleStyle}
              groupName={groupTitle}
              highlightMsgId={highlightMsgId}
              onHighlightDone={() => setHighlightMsgId(null)}
            />
            <InputBox
              groupId={currentGroup.id}
              members={members.filter((mb) => mb.id !== user.id)}
              archived={currentGroup.is_archived === 1}
              observer={currentGroup.is_dm !== 1 && myRole === 'observer'}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
              reEditDraft={reEditDraft}
              onReEditDraftDone={() => setReEditDraft(null)}
              onSendText={handleSendText}
              onSendFile={sendFileMessage}
              sending={sending}
              uploadProgress={uploadProgress}
              isDarkMode={isDarkMode}
              fontSize={fontSize}
            />
          </div>
        ) : (
          // 未选择群的空态
          <div className={`flex-1 flex flex-col items-center justify-center ${isDarkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
            <button
              onClick={() => (isMobile ? setSidebarVisible(true) : setShowCreateGroup(true))}
              className="flex flex-col items-center"
            >
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${isDarkMode ? 'bg-gray-700' : 'bg-green-100'}`}>
                <Hash className={`w-10 h-10 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <p className={`text-base font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {groups.length === 0 ? '创建你的第一个群聊' : '从左侧选择一个群聊'}
              </p>
              <p className="text-sm mt-1 text-gray-400">
                {groups.length === 0 ? '把不同类别的事情，分别放进不同的群' : '或新建一个群聊开始记录'}
              </p>
            </button>
          </div>
        ))}
      </div>

      {/* 弹窗 */}
      {showCreateGroup && (
        <CreateGroupModal
          onCreate={handleCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          isDarkMode={isDarkMode}
        />
      )}

      {showGroupInfo && currentGroup && (
        <GroupInfoModal
          group={currentGroup}
          currentUserId={user.id}
          onGroupChanged={refreshGroups}
          onGroupDeleted={() => setCurrentGroupId(null)}
          onClose={() => setShowGroupInfo(false)}
          isDarkMode={isDarkMode}
        />
      )}

      {showSettings && (
        <ProfileSettings
          user={user}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          bubbleStyle={bubbleStyle}
          onBubbleStyleChange={setBubbleStyle}
          foldLen={foldLen}
          onFoldLenChange={setFoldLen}
          todoNotePopup={todoNotePopup}
          onTodoNotePopupChange={setTodoNotePopup}
          onUpdate={updateProfile}
          onAvatarChanged={setUserAvatarVer}
          onLogout={logout}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 头像裁剪上传 */}
      {cropOpen && (
        <AvatarCropModal
          isDarkMode={isDarkMode}
          onClose={() => setCropOpen(false)}
          onDone={async (dataUrl) => {
            try {
              const r = await api.setAvatar(dataUrl);
              setCachedAvatar(user.id, r.avatar_ver, dataUrl);
              setUserAvatarVer(r.avatar_ver);
              setCropOpen(false);
            } catch (e) {
              alert(e instanceof Error ? e.message : '头像上传失败');
            }
          }}
        />
      )}

      {/* 搜索面板常驻挂载：关闭只是隐藏，再次打开仍保留上次的关键词与结果（可随时"回到搜索结果"） */}
      <SearchPanel
        open={searchOpen}
        currentGroupId={currentGroupId}
        currentGroupName={groupTitle}
        groups={groups}
        isDarkMode={isDarkMode}
        onJump={handleSearchJump}
        onClose={() => setSearchOpen(false)}
        defaultScopeAll={searchScopeAll}
        defaultMode={searchMode}
      />

      {forwardMsgs && (
        <ForwardModal
          groups={groups.filter((g) => g.is_archived === 0)}
          count={forwardMsgs.length}
          onConfirm={handleForward}
          onClose={() => setForwardMsgs(null)}
          isDarkMode={isDarkMode}
        />
      )}

      {singleForwardMsg && (
        <ForwardModal
          groups={groups.filter((g) => g.is_archived === 0)}
          count={1}
          onConfirm={handleForwardSingle}
          onClose={() => {
            setSingleForwardMsg(null);
            setSingleForwardWithSource(false);
          }}
          isDarkMode={isDarkMode}
        />
      )}

      {shareCardMsgs && (
        <ShareCardModal
          messages={shareCardMsgs}
          cardSignature={user?.card_signature || ''}
          groupName={groupTitle}
          isDarkMode={isDarkMode}
          onClose={() => setShareCardMsgs(null)}
        />
      )}

      {/* 聊天区待办的到点提醒编辑 */}
      {dueEditMsg && (
        <DueEditor
          isDarkMode={isDarkMode}
          messageId={dueEditMsg.id}
          currentDue={dueEditMsg.due_at}
          groupName={currentGroup && dueEditMsg.group_id === currentGroup.id ? groupTitle : undefined}
          onClose={() => setDueEditId(null)}
          onSaved={(due) => void handleSaveDue(dueEditMsg.id, due)}
        />
      )}

      {/* 待办备注弹窗：设为待办（弹出开关开启）/添加修改待办备注共用，含快速时长文本 */}
      {todoNoteEdit && (
        <TodoNoteModal
          isDarkMode={isDarkMode}
          title={todoNoteEdit.msg.todo_status === 0 ? '设为待办事项' : '修改待办备注'}
          initialNote={todoNoteEdit.msg.todo_note ?? ''}
          onSave={handleTodoNoteSave}
          // 仅未完成待办可设到点提醒（后端限制 todo_status=1）
          onSetDue={todoNoteEdit.status === 1 ? handleTodoNoteSetDue : undefined}
          onClose={() => setTodoNoteEdit(null)}
        />
      )}

      {/* 记账：金额录入/修改（key 保证换消息时重挂载，预填值只取首次） */}
      {amountEditMsg && (
        <AmountEditor
          key={amountEditMsg.id}
          isDarkMode={isDarkMode}
          fontSize={fontSize}
          message={amountEditMsg}
          initialType={amountPrefill.type}
          initialCategory={amountPrefill.category}
          inheritHint={amountPrefill.hint}
          onSaved={handleAmountSaved}
          onClose={() => setAmountEditMsg(null)}
        />
      )}

      {/* 记账汇总面板（按当前群/会话统计）；明细记录点击可跳转到聊天中的该条消息 */}
      {ledgerOpen && currentGroup && (
        <LedgerSummary
          isDarkMode={isDarkMode}
          fontSize={fontSize}
          groupId={currentGroup.id}
          groupName={groupTitle}
          onJump={(gid, msgId) => {
            setLedgerOpen(false);
            handlePanelJump(gid, msgId);
          }}
          onClose={() => setLedgerOpen(false)}
        />
      )}

      {/* 轻提示 */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[80] bg-black/75 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
