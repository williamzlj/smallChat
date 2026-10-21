import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Inbox, Menu, X, Download, Copy, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { CrossGroupMessage, GroupRole } from '../api/types';
import { usePanelMenu, PanelItem, msgLine, msgText, PanelAction, isOverdueTodo } from './PanelShared';
import { DueEditor } from './DueEditor';
import { ContextModal } from './ContextModal';

interface Props {
  isDarkMode: boolean;
  fontSize: number;
  onJump: (groupId: number, messageId: number) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  // 群 id → 本人在该群的角色（用于条目操作权限判定）
  roleOf: (groupId: number) => GroupRole | undefined;
  // 委托：切到该群会话并预填委托文案（summary=消息内容摘要）
  onDelegate: (groupId: number, summary: string, kind: 'todo' | 'important') => void;
}

type Tab = 'pending' | 'done' | 'dueFuture' | 'duePast' | 'calendar';

// 月历视图用：本地日期串（YYYY-MM-DD）与星期名
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = fmtDate(new Date());
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const weekdayOf = (date: string) => WEEKDAY[new Date(`${date}T00:00:00`).getDay()];

// 跨群待办面板：未完成 / 已完成，支持归档过滤、右键操作、多选合并复制
export const TodoPanel = ({ isDarkMode, fontSize, onJump, onToggleSidebar, sidebarOpen, roleOf, onDelegate }: Props) => {
  const [tab, setTab] = useState<Tab>('pending');
  const [showArchived, setShowArchived] = useState(false);
  const [messages, setMessages] = useState<CrossGroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // 到点提醒编辑（右键「设置到点提醒」打开）
  const [dueEdit, setDueEdit] = useState<CrossGroupMessage | null>(null);
  // 待办备注编辑（右键「添加/修改待办备注」打开）
  const [noteEdit, setNoteEdit] = useState<CrossGroupMessage | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  // 上下文弹窗
  const [contextMsg, setContextMsg] = useState<CrossGroupMessage | null>(null);
  // 月历视图：月份、选中日期、列表/月历切换、窄屏判定（手机只显示圆点）
  const [calMonth, setCalMonth] = useState(todayStr.slice(0, 7));
  const [calDate, setCalDate] = useState(todayStr);
  const [calMode, setCalMode] = useState<'month' | 'list'>('month');
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 639px)').matches);

  const load = async () => {
    setLoading(true);
    try {
      const { messages: list } = await api.messagesTodos();
      setMessages(list);
    } catch {
      // 忽略
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // 窄屏（手机）不显示提醒文字，只显示颜色圆点
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const handleAction = async (action: PanelAction, msg: CrossGroupMessage) => {
    try {
      if (action.type === 'todoStatus') {
        await api.messagesSetTodo(msg.id, action.status);
        // 本地更新，不再整体刷新列表，保持滚动位置
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, todo_status: action.status } : m)));
        return;
      } else if (action.type === 'archived') {
        await api.messagesSetArchived(msg.id, action.archived);
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, todo_archived: action.archived } : m)));
        return;
      } else if (action.type === 'normal') {
        await api.messagesSetTodo(msg.id, 0);
        // 与后端一致：转普通消息时同时清掉到点提醒，否则提醒/月历页签里仍会残留该条
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, todo_status: 0, due_at: null } : m)));
        return;
      } else if (action.type === 'setDue') {
        setDueEdit(msg);
        return;
      } else if (action.type === 'todoNote') {
        setNoteDraft(msg.todo_note ?? '');
        setNoteEdit(msg);
        return;
      } else if (action.type === 'copy') {
        await navigator.clipboard.writeText(msgLine(msg));
        setExportMsg('已复制');
        setTimeout(() => setExportMsg(''), 1500);
        return;
      } else if (action.type === 'viewContext') {
        setContextMsg(msg);
        return;
      } else if (action.type === 'view') {
        onJump(msg.group_id, msg.id);
        return;
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  // 保存待办备注：保持当前完成状态，仅更新 note；成功用轻提示反馈
  const saveTodoNote = async () => {
    const msg = noteEdit;
    if (!msg) return;
    const note = noteDraft.trim();
    try {
      await api.messagesSetTodo(msg.id, msg.todo_status, note);
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, todo_note: note } : m)));
      setNoteEdit(null);
      setExportMsg('备注已保存');
      setTimeout(() => setExportMsg(''), 1500);
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  // 管理能力：私聊豁免；群聊需群主/副群主；群不在列表时放行（服务端兜底）
  const canManageOf = useCallback(
    (m: CrossGroupMessage) => {
      if (m.is_dm === 1) return true;
      const r = roleOf(m.group_id);
      return r === undefined || r === 'owner' || r === 'admin';
    },
    [roleOf],
  );
  // 「委托」仅普通成员可见（观察者只读到底；私聊无需委托）
  const canDelegateOf = useCallback(
    (m: CrossGroupMessage) => m.is_dm !== 1 && roleOf(m.group_id) === 'member',
    [roleOf],
  );

  const { openMenu, menuEl, selTextId, setSelTextId } = usePanelMenu({ isDarkMode, mode: 'todo', onAction: handleAction, canManageOf });

  const isDueTab = tab === 'dueFuture' || tab === 'duePast';
  // 与后端 due_at 同格式（Y-m-d H:i:s）的当前时间串，直接按字典序比较
  const nowStr = (() => {
    const p = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:59`;
  })();

  const filtered = messages.filter((m) => {
    const matchArchived = showArchived ? true : m.todo_archived === 0;
    if (!matchArchived) return false;
    if (tab === 'pending') return m.todo_status === 1;
    if (tab === 'done') return m.todo_status === 2;
    // 提醒标签页：所有设过提醒时间的待办（含已完成待办残留的提醒），按是否到期分两边
    if (!m.due_at) return false;
    return tab === 'dueFuture' ? m.due_at > nowStr : m.due_at <= nowStr;
  });

  // 提醒标签页统一按提醒时间降序（日期晚的在前）
  const shown = isDueTab
    ? [...filtered].sort((a, b) => (b.due_at ?? '').localeCompare(a.due_at ?? ''))
    : filtered;

  // ---- 月历 / 按日期分组列表：只收录设了提醒的待办（含已完成，跟随归档开关） ----
  const auxSize = Math.max(fontSize - 6, 14);
  const contentSize = Math.max(fontSize - 4, 14);
  const reminderMsgs = messages.filter((m) => (showArchived || m.todo_archived === 0) && m.due_at);
  const dayMap = new Map<string, CrossGroupMessage[]>();
  reminderMsgs.forEach((m) => {
    const key = (m.due_at as string).slice(0, 10);
    const list = dayMap.get(key);
    if (list) list.push(m);
    else dayMap.set(key, [m]);
  });
  // 列表视图按提醒日期降序分组，组内按当天时间升序
  const dateGroups = Array.from(dayMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(
      ([date, list]) =>
        [date, [...list].sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))] as [string, CrossGroupMessage[]],
    );

  const dueStateOf = (m: CrossGroupMessage): 'done' | 'overdue' | 'today' | 'upcoming' => {
    if (m.todo_status === 2) return 'done';
    if (isOverdueTodo(m.due_at, m.todo_status)) return 'overdue';
    return (m.due_at ?? '').slice(0, 10) === todayStr ? 'today' : 'upcoming';
  };
  // 颜色圆点：红=已到期、绿=今天、灰=未到期、空心绿=已完成（与页签配色一致）
  const dueDotCls = (m: CrossGroupMessage) => {
    const st = dueStateOf(m);
    if (st === 'done') return 'border border-green-500 bg-transparent';
    if (st === 'overdue') return 'bg-red-500';
    if (st === 'today') return 'bg-green-500';
    return isDarkMode ? 'bg-gray-500' : 'bg-gray-400';
  };

  const shiftCalMonth = (delta: number) => {
    const [y, m] = calMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setCalMonth(next);
    setCalDate(next === todayStr.slice(0, 7) ? todayStr : `${next}-01`);
  };

  // 单条提醒（月历下方当日清单 / 列表视图共用）
  const reminderRow = (m: CrossGroupMessage) => {
    const st = dueStateOf(m);
    const tagText = st === 'done' ? '已完成' : st === 'overdue' ? '已到期' : st === 'today' ? '今天' : '未到期';
    const tagCls =
      st === 'done' || st === 'today'
        ? 'text-green-600 dark:text-green-400'
        : st === 'overdue'
          ? 'text-red-600 dark:text-red-400'
          : isDarkMode
            ? 'text-gray-400'
            : 'text-gray-500';
    return (
      <div
        key={m.id}
        onClick={() => onJump(m.group_id, m.id)}
        onContextMenu={(e) => openMenu(e, m)}
        className={`flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer ${
          isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
        }`}
      >
        <span
          className={`font-mono flex-shrink-0 leading-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
          style={{ fontSize: `${contentSize}px` }}
        >
          {(m.due_at ?? '').slice(11, 16)}
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={`break-words line-clamp-2 ${
              st === 'done' ? 'line-through text-gray-400' : isDarkMode ? 'text-gray-100' : 'text-gray-700'
            }`}
            style={{ fontSize: `${contentSize}px` }}
          >
            {msgText(m)}
          </p>
          <p className="text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap" style={{ fontSize: `${auxSize}px` }}>
            <span className="truncate">「{m.group_name}」</span>
            <span
              className={`flex-shrink-0 ${
                st === 'overdue' ? 'px-1.5 py-0.5 rounded text-sm font-medium bg-red-500 text-white' : tagCls
              }`}
            >
              {tagText}
            </span>
          </p>
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    const [cy, cm] = calMonth.split('-').map(Number);
    const monthItems = reminderMsgs.filter((m) => (m.due_at as string).startsWith(calMonth));
    const first = new Date(cy, cm - 1, 1);
    const offset = (first.getDay() + 6) % 7; // 周一为一周开始
    const daysInMonth = new Date(cy, cm, 0).getDate();
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    const selectedItems = [...(dayMap.get(calDate) ?? [])].sort((a, b) =>
      (a.due_at ?? '').localeCompare(b.due_at ?? ''),
    );
    const navBtn = `p-1 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`;
    const segBtn = (active: boolean) =>
      `px-2.5 py-1 text-sm rounded-md transition-colors ${
        active
          ? isDarkMode
            ? 'bg-gray-800 text-white'
            : 'bg-white text-gray-800 shadow-sm'
          : isDarkMode
            ? 'text-gray-400'
            : 'text-gray-500'
      }`;

    const cell = (i: number) => {
      const d = new Date(cy, cm - 1, 1 - offset + i);
      const key = fmtDate(d);
      const inMonth = d.getMonth() === cm - 1;
      const items = dayMap.get(key) ?? [];
      const isToday = key === todayStr;
      const isSel = key === calDate;
      return (
        <button
          key={key}
          type="button"
          onClick={() => setCalDate(key)}
          className={`flex flex-col items-start gap-0.5 rounded-lg border p-1 overflow-hidden text-left ${
            isSel
              ? 'ring-2 ring-green-500 border-transparent'
              : isToday
                ? 'border-green-500'
                : isDarkMode
                  ? 'border-gray-700'
                  : 'border-gray-200'
          } ${inMonth ? (isDarkMode ? 'bg-gray-800' : 'bg-white') : 'opacity-40'}`}
          style={{ minHeight: isMobile ? 52 : 78 }}
        >
          <span
            className={`flex items-center justify-center font-bold ${
              isToday
                ? 'w-5 h-5 rounded-full bg-green-500 text-white'
                : isDarkMode
                  ? 'text-gray-300'
                  : 'text-gray-600'
            }`}
            style={{ fontSize: `${auxSize}px` }}
          >
            {d.getDate()}
          </span>
          {isMobile ? (
            items.length > 0 && (
              <span className="flex flex-wrap items-center gap-0.5">
                {items.slice(0, 4).map((m) => (
                  <span key={m.id} className={`w-1.5 h-1.5 rounded-full ${dueDotCls(m)}`} />
                ))}
                {items.length > 4 && <span className="text-xs text-gray-400">+{items.length - 4}</span>}
              </span>
            )
          ) : (
            <>
              {items.slice(0, 2).map((m) => (
                <span key={m.id} className="flex items-center gap-1 min-w-0 w-full">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dueDotCls(m)}`} />
                  <span
                    className={`truncate ${
                      dueStateOf(m) === 'done'
                        ? 'line-through text-gray-400'
                        : isDarkMode
                          ? 'text-gray-300'
                          : 'text-gray-600'
                    }`}
                    style={{ fontSize: '12px' }}
                  >
                    {msgText(m)}
                  </span>
                </span>
              ))}
              {items.length > 2 && <span className="text-xs text-gray-400">+{items.length - 2}</span>}
            </>
          )}
        </button>
      );
    };

    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-base font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              {cy}年{cm}月
            </span>
            <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {monthItems.length} 条提醒
            </span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {calMode === 'month' && (
              <>
                <button onClick={() => shiftCalMonth(-1)} className={navBtn} title="上个月">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setCalMonth(todayStr.slice(0, 7));
                    setCalDate(todayStr);
                  }}
                  className={`px-2 py-1 text-sm rounded-lg ${
                    isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  今天
                </button>
                <button onClick={() => shiftCalMonth(1)} className={navBtn} title="下个月">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
            <div className={`flex gap-0.5 rounded-lg p-0.5 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
              <button onClick={() => setCalMode('list')} className={segBtn(calMode === 'list')}>
                列表
              </button>
              <button onClick={() => setCalMode('month')} className={segBtn(calMode === 'month')}>
                月历
              </button>
            </div>
          </div>
        </div>

        {calMode === 'list' ? (
          dateGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Inbox className="w-12 h-12 mb-2" />
              <p className="text-sm">没有设置提醒的事项</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dateGroups.map(([date, list]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                      {date} {weekdayOf(date)}
                    </span>
                    {date === todayStr && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-green-500 text-white">今天</span>
                    )}
                    <span className="text-sm text-gray-400">{list.length} 条提醒</span>
                  </div>
                  <div className="space-y-1.5">{list.map(reminderRow)}</div>
                </div>
              ))}
            </div>
          )
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
                <div key={w} className="text-center text-sm text-gray-400 py-0.5">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: total }, (_, i) => cell(i))}
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-2 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                已到期
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                今天
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                未到期
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full border border-green-500" />
                已完成
              </span>
            </div>
            <div className={`mt-3 rounded-xl p-3 ${isDarkMode ? 'bg-gray-700/60' : 'bg-white'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                  {calDate} {weekdayOf(calDate)}
                </span>
                <span className="text-sm text-gray-400">{selectedItems.length} 条提醒</span>
              </div>
              {selectedItems.length === 0 ? (
                <p className="text-sm text-gray-400 py-1">这天没有设置提醒</p>
              ) : (
                <div className="space-y-1.5">{selectedItems.map(reminderRow)}</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const copySelected = async () => {
    const list = shown.filter((m) => selected.has(m.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (list.length === 0) return;
    const text = list.map(msgLine).join('\n');
    await navigator.clipboard.writeText(text);
    setExportMsg(`已复制 ${list.length} 条`);
    setTimeout(() => setExportMsg(''), 1500);
    exitSelect();
  };

  const handleExport = () => {
    const p = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const lineOf = (m: CrossGroupMessage) => {
      const where = m.is_dm === 1 ? '私聊' : `群「${m.group_name}」`;
      const note = m.todo_note ? `\n    备注：${m.todo_note}` : '';
      const archived = m.todo_archived === 1 ? ' [已归档]' : '';
      return `[${m.created_at}] ${m.nickname}（${where}）：${msgText(m)}${note}${archived}`;
    };
    const pending = messages.filter((m) => m.todo_status === 1 && m.todo_archived === 0).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const done = messages.filter((m) => m.todo_status === 2 && m.todo_archived === 0).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const archived = messages.filter((m) => m.todo_archived === 1).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const header = `# 全部待办\n# 导出时间: ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}\n# 未完成 ${pending.length} 条 / 已完成 ${done.length} 条 / 已归档 ${archived.length} 条\n`;
    const body = [
      '【未完成】',
      ...pending.map(lineOf),
      '',
      '【已完成】',
      ...done.map(lineOf),
      '',
      '【已归档】',
      ...archived.map(lineOf),
    ].join('\n');
    const blob = new Blob([`${header}\n${body}\n`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `待办事项-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExportMsg(`已导出 ${pending.length + done.length + archived.length} 条`);
    setTimeout(() => setExportMsg(''), 2000);
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
      <div className={`border-b px-2 sm:px-4 py-2.5 flex items-center justify-between flex-shrink-0 ${
        isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center min-w-0">
          <button
            onClick={onToggleSidebar}
            className={`p-1.5 rounded-lg lg:hidden flex-shrink-0 ${
              isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <h2 className={`text-base font-semibold ml-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>全部待办</h2>
        </div>
        <div className="flex items-center flex-shrink-0">
          {exportMsg && <span className="text-sm text-green-600 mr-1">{exportMsg}</span>}
          <button
            onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
            className={`p-2 rounded-lg ${selectMode ? 'bg-green-100 text-green-600' : isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
            title={selectMode ? '退出多选' : '多选合并复制'}
          >
            <Copy className="w-5 h-5" />
          </button>
          <button
            onClick={handleExport}
            disabled={messages.length === 0}
            className={`p-2 rounded-lg disabled:opacity-40 ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
            title="导出待办事项（txt）"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={() => void load()}
            className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
            title="刷新"
          >
            <Loader2 className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className={`px-3 pt-3 flex gap-2 flex-shrink-0 flex-wrap items-center`}>
        <button
          onClick={() => setTab('pending')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            tab === 'pending'
              ? 'bg-amber-500 text-white'
              : isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'
          }`}
        >
          未完成
        </button>
        <button
          onClick={() => setTab('done')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            tab === 'done'
              ? 'bg-green-500 text-white'
              : isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'
          }`}
        >
          已完成
        </button>
        <button
          onClick={() => setTab('dueFuture')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            tab === 'dueFuture'
              ? 'bg-blue-500 text-white'
              : isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'
          }`}
        >
          未到期提醒
        </button>
        <button
          onClick={() => setTab('duePast')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            tab === 'duePast'
              ? 'bg-red-500 text-white'
              : isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'
          }`}
        >
          已到期提醒
        </button>
        <button
          onClick={() => setTab('calendar')}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            tab === 'calendar'
              ? 'bg-indigo-500 text-white'
              : isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'
          }`}
        >
          月历
        </button>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
            showArchived
              ? 'bg-gray-500 text-white'
              : isDarkMode ? 'bg-gray-700 text-gray-400' : 'bg-white text-gray-500'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          {showArchived ? '含已归档' : '查看已归档'}
        </button>
      </div>

      {selectMode && (
        <div className={`mx-3 mt-2 px-3 py-2 rounded-xl flex items-center justify-between flex-shrink-0 ${isDarkMode ? 'bg-gray-700' : 'bg-white shadow-sm'}`}>
          <span className="text-sm">已选 {selected.size} 条</span>
          <div className="flex gap-2">
            <button
              onClick={copySelected}
              disabled={selected.size === 0}
              className="px-3 py-1.5 text-sm rounded-full bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center gap-1"
            >
              <Copy className="w-4 h-4" />
              合并复制
            </button>
            <button onClick={exitSelect} className={`p-1.5 rounded-full ${isDarkMode ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-100'}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : tab === 'calendar' ? (
          renderCalendar()
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Inbox className="w-12 h-12 mb-2" />
            <p className="text-sm">
              {showArchived
                ? '没有匹配的待办'
                : tab === 'pending'
                  ? '没有未完成的待办'
                  : tab === 'done'
                    ? '没有已完成的待办'
                    : tab === 'dueFuture'
                      ? '没有未到期的提醒'
                      : '没有已到期的提醒'}
            </p>
            {!showArchived && <p className="text-xs mt-1">已归档的待办被隐藏，点击上方"查看已归档"显示</p>}
          </div>
        ) : (
          shown.map((m) => (
            <PanelItem
              key={m.id}
              msg={m}
              isDarkMode={isDarkMode}
              fontSize={fontSize}
              mode="todo"
              selected={selected.has(m.id)}
              selectMode={selectMode}
              selectable={selTextId === m.id}
              canDelegate={canDelegateOf(m)}
              onDelegate={(msg) => onDelegate(msg.group_id, msgText(msg).slice(0, 30), 'todo')}
              onExitSelect={() => setSelTextId(null)}
              onToggleSelect={toggleSelect}
              onView={(msg) => onJump(msg.group_id, msg.id)}
              onViewContext={(msg) => setContextMsg(msg)}
              onContextMenu={openMenu}
            />
          ))
        )}
      </div>
      {menuEl}
      {/* 待办备注编辑弹窗：样式与消息备注弹窗一致 */}
      {noteEdit &&
        createPortal(
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] p-4" onClick={() => setNoteEdit(null)}>
            <div
              className={`rounded-2xl shadow-xl w-full max-w-sm ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                  {noteEdit.todo_note ? '修改待办备注' : '添加待办备注'}
                </h3>
                <button
                  onClick={() => setNoteEdit(null)}
                  className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value.slice(0, 500))}
                  rows={3}
                  autoFocus
                  placeholder="待办备注，留空清除"
                  className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-amber-500 resize-none ${
                    isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'
                  }`}
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => setNoteEdit(null)}
                    className={`px-4 py-2 text-sm rounded-lg ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    取消
                  </button>
                  <button
                    onClick={() => void saveTodoNote()}
                    className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {dueEdit && (
        <DueEditor
          isDarkMode={isDarkMode}
          messageId={dueEdit.id}
          currentDue={dueEdit.due_at}
          groupName={dueEdit.is_dm === 1 ? '私聊' : `群「${dueEdit.group_name}」`}
          onClose={() => setDueEdit(null)}
          onSaved={(dueAt) => {
            setMessages((prev) => prev.map((m) => (m.id === dueEdit.id ? { ...m, due_at: dueAt } : m)));
            setDueEdit(null);
          }}
        />
      )}
      {contextMsg && (
        <ContextModal
          messageId={contextMsg.id}
          isDarkMode={isDarkMode}
          fontSize={fontSize}
          onClose={() => setContextMsg(null)}
          onJump={(gid, mid) => {
            setContextMsg(null);
            onJump(gid, mid);
          }}
        />
      )}
    </div>
  );
};
