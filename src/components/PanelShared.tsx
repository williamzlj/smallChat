// 待办/重要消息面板共用的右键菜单 + 条目渲染
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Square, CheckSquare, Archive, ArchiveRestore, MessageSquare,
  Palette, Copy, ExternalLink, Loader2, TextSelect, BellRing, BellOff, MessagesSquare, StickyNote,
  Circle, CheckCircle, ChevronDown,
} from 'lucide-react';
import { CrossGroupMessage } from '../api/types';

// 颜色标记选项（菜单里排成一行图标，节省菜单高度）
export const COLOR_OPTS: { color: number; bg: string; title: string }[] = [
  { color: 1, bg: 'bg-red-500', title: '红色：危险、需要特别留意' },
  { color: 2, bg: 'bg-orange-500', title: '橘色：积极、给人力量' },
  { color: 6, bg: 'bg-yellow-400', title: '黄色：关心的事情' },
  { color: 7, bg: 'bg-green-500', title: '绿色：读书笔记、时文阅读' },
  { color: 3, bg: 'bg-blue-500', title: '蓝色：业务流程备注' },
  { color: 5, bg: 'bg-purple-500', title: '紫色：想法、创意' },
  { color: 4, bg: 'bg-gray-500', title: '灰色：高于普通的关注事项' },
];

// 待办提醒是否已逾期（到期且未完成）：due_at 与当前时间串同为 Y-m-d H:i:s 格式，直接按字典序比较；
// 秒取 :59 与 TodoPanel「已到期」页签的判断保持一致
export const isOverdueTodo = (dueAt: string | null | undefined, todoStatus: number | null | undefined): boolean => {
  if (!dueAt || todoStatus === 2) return false;
  const p = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const nowStr = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:59`;
  return dueAt <= nowStr;
};

// 待办状态圆点（列表视图与提醒月历共用同一套规则）：
// 蓝=未到期、红=已到期、绿=已完成、灰实心=已归档已完成、灰空心=已归档未完成、橘黄空心=未设置提醒
export const todoDotCls = (m: CrossGroupMessage, isDarkMode: boolean): string => {
  if (m.todo_archived === 1) {
    return m.todo_status === 2
      ? isDarkMode
        ? 'bg-gray-500'
        : 'bg-gray-400'
      : 'border-2 border-gray-400 dark:border-gray-500 bg-transparent';
  }
  if (m.todo_status === 2) return 'bg-green-500';
  if (!m.due_at) return 'border-2 border-amber-500 bg-transparent';
  return isOverdueTodo(m.due_at, m.todo_status) ? 'bg-red-500' : 'bg-blue-500';
};

export type PanelAction =
  | { type: 'todoStatus'; status: number } // 1=未完成 2=已完成
  | { type: 'archived'; archived: number } // 0=活跃 1=已归档
  | { type: 'normal' } // 转普通消息
  | { type: 'setDue' } // 设置/清除到点提醒
  | { type: 'todoNote' } // 添加/修改待办备注（仅待办模式）
  | { type: 'messageNote' } // 添加/修改消息备注（公共/私有，仅待办模式）
  | { type: 'color'; color: number } // 0=取消 1红 2橘 3蓝 4灰
  | { type: 'copy' } // 复制（带时间）
  | { type: 'selectText' } // 开启文本选择模式
  | { type: 'viewContext' } // 弹窗查看前后各 5 条上下文
  | { type: 'view' }; // 在聊天中查看（跳转到该消息）

interface MenuState {
  x: number;
  y: number;
  msg: CrossGroupMessage;
}

interface UsePanelMenuOptions {
  isDarkMode: boolean;
  mode: 'todo' | 'important';
  // 可选 selectedIds：多选模式下右键触发时，onAction 会收到批量 id 数组
  onAction: (action: PanelAction, msg: CrossGroupMessage, selectedIds?: number[]) => void;
  // 条目所在群的管理能力判定（群主/副群主或私聊=true；普通成员/观察者=false）
  canManageOf: (msg: CrossGroupMessage) => boolean;
  selectMode: boolean;
  selectedIds: Set<number>;
}

// 菜单触发点：鼠标右键事件或触摸长按坐标
export type MenuTrigger = {
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

// 通用右键菜单 Hook
export const usePanelMenu = ({ isDarkMode, mode, onAction, canManageOf, selectMode, selectedIds }: UsePanelMenuOptions) => {
  const [menu, setMenu] = useState<MenuState | null>(null);
  // 文本选择模式：只能同时给一条消息开启（该消息临时允许选中文字）
  const [selTextId, setSelTextId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const openMenu = (e: MenuTrigger, msg: CrossGroupMessage) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 320);
    setMenu({ x, y, msg });
  };

  // 菜单渲染后按实测宽高二次校正位置（修复 iPhone Chrome 上估算高度偏差导致菜单偏上）
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    let { x, y } = menu;
    if (x + r.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r.width - 8);
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - r.height - 8);
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y });
  }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  const fire = (action: PanelAction) => {
    if (!menu) return;
    if (action.type === 'selectText') {
      setSelTextId(menu.msg.id);
      setMenu(null);
      return;
    }
    // 批量操作：selectMode + selectedIds.size > 1 时把 id 数组传给 onAction
    const ids = selectMode && selectedIds.size > 1 ? Array.from(selectedIds) : undefined;
    onAction(action, menu.msg, ids);
    setMenu(null);
  };

  // 批量模式下（selectMode + 选中 > 1 条）隐藏单条专属操作（每条内容不同，无法统一批量）
  const isBatch = selectMode && selectedIds.size > 1;

  // 管理类菜单项：普通成员/观察者只可看不可操作（保留渲染置灰禁用，避免布局跳动）
  const manage = menu ? canManageOf(menu.msg) : false;
  const NO_PERM_TITLE = '需群主或副群主操作';

  const item = (
    icon: React.ReactNode,
    label: string,
    action: PanelAction,
    danger = false,
    disabled = false,
  ) => (
    <button
      key={label}
      onClick={() => fire(action)}
      disabled={disabled}
      title={disabled ? NO_PERM_TITLE : undefined}
      className={`w-full flex items-center space-x-2.5 px-3.5 py-2 text-sm text-left transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-gray-500 dark:text-gray-400'
          : danger
            ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
            : isDarkMode
              ? 'text-gray-200 hover:bg-gray-700'
              : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const menuEl = menu
    ? createPortal(
        <div
          ref={menuRef}
          className={`fixed z-[80] rounded-xl shadow-xl border py-1.5 min-w-[200px] ${
            isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
          }`}
          style={{ left: menu.x, top: menu.y }}
        >
          {isBatch && (
            <div className={`px-3.5 py-1.5 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              已选 {selectedIds.size} 条，批量操作将作用于全部选中项
            </div>
          )}
          {mode === 'todo' ? (
            <>
              {/* 对当前状态无效的操作不显示：未完成的不显示「标记为未完成」，已完成的不显示「标记为已完成」 */}
              {(menu.msg.todo_status !== 1 || isBatch) &&
                item(<Square className="w-4 h-4 text-amber-500" />, `标记为未完成${isBatch ? `（${selectedIds.size} 条）` : ''}`, { type: 'todoStatus', status: 1 }, false, !manage)}
              {(menu.msg.todo_status !== 2 || isBatch) &&
                item(<CheckSquare className="w-4 h-4 text-green-500" />, `标记为已完成${isBatch ? `（${selectedIds.size} 条）` : ''}`, { type: 'todoStatus', status: 2 }, false, !manage)}
              {!isBatch && menu.msg.todo_status === 1 &&
                (menu.msg.due_at
                  ? item(<BellOff className="w-4 h-4 text-gray-500" />, '修改/清除提醒', { type: 'setDue' }, false, !manage)
                  : item(<BellRing className="w-4 h-4 text-amber-500" />, '设置到点提醒', { type: 'setDue' }, false, !manage))}
              {!isBatch && item(
                <StickyNote className="w-4 h-4 text-amber-500" />,
                menu.msg.todo_note ? '修改待办备注' : '添加待办备注',
                { type: 'todoNote' },
                false,
                !manage,
              )}
              {!isBatch && item(
                <StickyNote className="w-4 h-4 text-blue-500" />,
                menu.msg.note || menu.msg.my_note ? '修改消息备注' : '添加消息备注',
                { type: 'messageNote' },
              )}
              {menu.msg.todo_archived === 1
                ? item(<ArchiveRestore className="w-4 h-4 text-blue-500" />, `恢复为活跃${isBatch ? `（${selectedIds.size} 条）` : ''}`, { type: 'archived', archived: 0 }, false, !manage)
                : item(<Archive className="w-4 h-4 text-gray-500" />, `标记为已归档${isBatch ? `（${selectedIds.size} 条）` : ''}`, { type: 'archived', archived: 1 }, false, !manage)}
              {item(<MessageSquare className="w-4 h-4 text-gray-500" />, `转为普通消息${isBatch ? `（${selectedIds.size} 条）` : ''}`, { type: 'normal' }, false, !manage)}
            </>
          ) : (
            <>
              {/* 颜色标记：一行 4 个图标（节省菜单高度）；无管理权限时整行置灰禁用 */}
              <div
                className={`px-3.5 py-2 flex items-center gap-2.5 ${manage ? '' : 'opacity-40'}`}
                title={manage ? (isBatch ? `为全部 ${selectedIds.size} 条设置颜色标记` : undefined) : NO_PERM_TITLE}
              >
                <Palette className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                {COLOR_OPTS.map((o) => (
                  <button
                    key={o.color}
                    disabled={!manage}
                    onClick={() => fire({ type: 'color', color: o.color })}
                    title={manage ? (isBatch ? `为全部 ${selectedIds.size} 条设置${o.title}` : o.title) : NO_PERM_TITLE}
                    className={`w-6 h-6 rounded-full ${o.bg} ring-1 ring-black/10 transition-transform flex-shrink-0 ${
                      manage ? 'hover:scale-110' : 'cursor-not-allowed'
                    }`}
                  />
                ))}
              </div>
              {item(<Palette className="w-4 h-4 text-gray-400" />, `取消颜色标记${isBatch ? `（${selectedIds.size} 条）` : ''}`, { type: 'color', color: 0 }, false, !manage)}
              {menu.msg.important_archived === 1
                ? item(<ArchiveRestore className="w-4 h-4 text-blue-500" />, `恢复为活跃${isBatch ? `（${selectedIds.size} 条）` : ''}`, { type: 'archived', archived: 0 }, false, !manage)
                : item(<Archive className="w-4 h-4 text-gray-500" />, `标记为已归档${isBatch ? `（${selectedIds.size} 条）` : ''}`, { type: 'archived', archived: 1 }, false, !manage)}
            </>
          )}
          <div className={`my-1 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`} />
          {item(<Copy className="w-4 h-4 text-gray-500" />, isBatch ? `合并复制（${selectedIds.size} 条）` : '复制消息（带时间）', { type: 'copy' })}
          {!isBatch && item(<TextSelect className="w-4 h-4 text-gray-500" />, '选择', { type: 'selectText' })}
          {!isBatch && item(<MessagesSquare className="w-4 h-4 text-blue-500" />, '查看该消息上下文', { type: 'viewContext' })}
          {!isBatch && item(<ExternalLink className="w-4 h-4 text-gray-500" />, '在聊天中查看', { type: 'view' })}
        </div>,
        document.body,
      )
    : null;

  return { openMenu, menuEl, selTextId, setSelTextId };
};

// 格式化消息内容为纯文本（复制用）
export const msgText = (m: CrossGroupMessage): string => {
  if (m.type === 'image') return '[图片]';
  if (m.type === 'file') return `[文件] ${m.content}`;
  if (m.type === 'forward') return '[聊天记录]';
  return m.content;
};

// 单条消息的复制文本（带时间）
export const msgLine = (m: CrossGroupMessage): string => {
  const where = m.is_dm === 1 ? '私聊' : `群「${m.group_name}」`;
  return `[${m.created_at.slice(0, 16)}] ${m.nickname}（${where}）：${msgText(m)}`;
};

interface PanelItemProps {
  msg: CrossGroupMessage;
  isDarkMode: boolean;
  fontSize: number;
  mode: 'todo' | 'important';
  selected: boolean;
  selectMode: boolean;
  selectable: boolean; // 已开启文本选择模式（本条消息允许选中文字）
  canDelegate: boolean; // 普通成员（非私聊）：可委托群主/副群主代为操作
  onDelegate: (msg: CrossGroupMessage) => void;
  onExitSelect: () => void;
  onToggleSelect: (id: number) => void;
  onView: (msg: CrossGroupMessage) => void;
  onViewContext: (msg: CrossGroupMessage) => void;
  onContextMenu: (e: MenuTrigger, msg: CrossGroupMessage) => void;
  compact?: boolean; // 折叠模式：只显示主行标题，隐藏备注/提醒/次要信息
  expanded?: boolean; // 折叠模式下本条是否被单独展开
  onToggleExpand?: () => void;
}

const COLOR_BORDER: Record<number, string> = {
  1: 'border-red-500',
  2: 'border-orange-400',
  6: 'border-yellow-400',
  7: 'border-green-500',
  3: 'border-blue-500',
  4: 'border-gray-500',
  5: 'border-purple-500',
};

// 通用面板条目：支持右键、多选、查看按钮
export const PanelItem = ({
  msg,
  isDarkMode,
  fontSize,
  mode,
  selected,
  selectMode,
  selectable,
  canDelegate,
  onDelegate,
  onExitSelect,
  onToggleSelect,
  onView,
  onViewContext,
  onContextMenu,
  compact = false,
  expanded = false,
  onToggleExpand,
}: PanelItemProps) => {
  // 折叠模式下只有单独展开的条目才显示详情
  const showDetail = !compact || expanded;
  // 当前模式下的归档状态：待办看 todo_archived，重要看 important_archived
  const archived = mode === 'todo' ? msg.todo_archived === 1 : msg.important_archived === 1;
  // 辅助文字统一字号：跟随设置缩放，最小 14px（与消息气泡规则一致）
  const auxSize = Math.max(fontSize - 6, 14);
  // 正文比辅助文字大两档：max(设置-4, 14)，面板是汇总查看，无需与气泡正文一样大
  const contentSize = Math.max(fontSize - 4, 14);
  // 状态圆点直径：跟正文大小联动（与提醒月历的 0.75em 规则一致）
  const dotPx = Math.round(contentSize * 0.75);
  const borderCls =
    mode === 'important' && msg.color_mark > 0
      ? `border-l-4 ${archived ? 'border-gray-400' : COLOR_BORDER[msg.color_mark] || ''}`
      : 'border border-transparent';

  // 手机端长按 500ms 弹出菜单（与聊天区一致；多选/文本选择模式下禁用）
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = (e: React.TouchEvent) => {
    if (selectable || selectMode) return;
    const t = e.touches[0];
    const cx = t.clientX;
    const cy = t.clientY;
    pressTimer.current = setTimeout(() => {
      onContextMenu({ clientX: cx, clientY: cy }, msg);
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  return (
    <div
      onContextMenu={(e) => {
        // 文本选择模式下放开原生右键菜单（方便直接用系统「复制」）
        if (selectable) return;
        onContextMenu(e, msg);
      }}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onTouchCancel={cancelPress}
      onClick={() => {
        if (selectMode) {
          onToggleSelect(msg.id);
          return;
        }
        // 折叠模式下点整条即展开/收起，方便临时查看被折叠的详情（文本选择模式下不触发）
        if (compact && onToggleExpand && !selectable) onToggleExpand();
      }}
      className={`relative w-full text-left px-3 py-2.5 rounded-xl mb-1.5 transition-colors cursor-pointer ${
        selectable ? 'select-text' : 'select-none'
      } ${borderCls} ${
        selected
          ? 'bg-green-100 dark:bg-green-900/30 ring-1 ring-green-400'
          : isDarkMode
            ? 'bg-gray-700/60 hover:bg-gray-700'
            : 'bg-white hover:bg-gray-50 shadow-sm'
      }`}
    >
      {selectMode && (
        <div className="absolute left-2 top-2.5">
          {selected ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <Circle className="w-4 h-4 text-gray-400" />
          )}
        </div>
      )}
      <div className={selectMode ? 'pl-6' : ''}>
        {selectable && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>已开启文本选择，拖动选中后复制</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExitSelect();
              }}
              className="px-2 py-0.5 text-sm rounded-md bg-green-500 text-white hover:bg-green-600 flex-shrink-0"
            >
              完成
            </button>
          </div>
        )}
        {/* 左侧固定 gutter（w-4）=待办勾选框 / 重要彩色圆点；右侧正文+备注+次要信息全部左对齐 */}
        <div className="flex items-start gap-1.5">
          {/* gutter 列：勾选框(待办) / 彩色圆点(重要)。与右侧正文顶部同基准，mt 补偿文字 leading */}
          <div className="w-4 flex-shrink-0 mt-[3px]">
            {mode === 'todo' ? (
              // 待办：状态圆点（与提醒月历同款同规则）
              <span className="w-4 h-4 flex items-center justify-center">
                <span
                  className={`inline-block rounded-full ${todoDotCls(msg, isDarkMode)}`}
                  style={{ width: dotPx, height: dotPx }}
                />
              </span>
            ) : msg.color_mark > 0 ? (
              // 重要消息：彩色圆点用 SVG（纯色 + 白色描边），和 lucide 图标一样吃父级 mt，统一处理对齐
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6.5"
                  fill={
                    archived
                      ? '#9CA3AF'
                      : msg.color_mark === 1
                        ? '#EF4444'
                        : msg.color_mark === 2
                          ? '#F97316'
                          : msg.color_mark === 6
                            ? '#EAB308'
                            : msg.color_mark === 7
                              ? '#22C55E'
                              : msg.color_mark === 3
                                ? '#3B82F6'
                                : msg.color_mark === 4
                                  ? '#6B7280'
                                  : msg.color_mark === 5
                                    ? '#8B5CF6'
                                    : '#9CA3AF'
                  }
                  stroke="white"
                  strokeWidth="2"
                />
              </svg>
            ) : (
              <span className="w-4 h-4" />
            )}
          </div>

          {/* 右侧：正文 + 备注 + 次要信息（全部左对齐；已归档则整体灰化） */}
          <div className="flex-1 min-w-0 space-y-1">
            {/* 行 A：消息正文（正常最多 3 行；折叠态压成单行省略号）+ 右侧操作按钮 */}
            <div className="flex items-start gap-1.5">
              <p
                className={`break-words flex-1 min-w-0 ${
                  selectable ? '' : showDetail ? 'line-clamp-3' : 'truncate'
                } ${
                  archived
                    ? 'text-gray-400 dark:text-gray-500'
                    : isDarkMode
                      ? 'text-gray-200'
                      : 'text-gray-700'
                }`}
                style={{ fontSize: `${contentSize}px` }}
              >
                {msgText(msg)}
              </p>
              {/* 右侧操作按钮 */}
              <div className="flex items-center gap-0.5 flex-shrink-0 mt-[3px]">
                {canDelegate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelegate(msg);
                    }}
                    className={`px-1.5 py-0.5 rounded-md font-medium ${isDarkMode ? 'text-green-400 hover:bg-gray-600' : 'text-green-600 hover:bg-green-50'}`}
                    style={{ fontSize: `${auxSize}px` }}
                    title="委托群主或副群主处理"
                  >
                    委托
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewContext(msg);
                  }}
                  className={`p-1 rounded ${isDarkMode ? 'text-gray-500 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`}
                  title="查看该消息上下文（前后各5条）"
                >
                  <MessagesSquare className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onView(msg);
                  }}
                  className={`p-1 rounded ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                  title="在聊天中查看"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                {/* 折叠模式下单独展开/收起该条详情 */}
                {compact && onToggleExpand && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand();
                    }}
                    className={`p-1 rounded ${isDarkMode ? 'text-gray-500 hover:bg-gray-600 hover:text-gray-300' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                    title={expanded ? '收起' : '展开详情'}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                  </button>
                )}
              </div>
            </div>

            {/* 行 B：备注类（提醒/待办备注/公共备注/我的备注），紧贴正文；已归档则灰化 */}
            {/* 折叠模式下隐藏详情，点右侧箭头单独展开 */}
            {showDetail && (
              <>
            {msg.due_at &&
              (isOverdueTodo(msg.due_at, msg.todo_status) ? (
                <p
                  className={`inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 ${
                    archived ? 'bg-gray-400 text-white' : 'bg-red-600 text-white'
                  }`}
                  style={{ fontSize: `${auxSize}px` }}
                >
                  <BellRing className="w-3 h-3 flex-shrink-0" />
                  提醒：{msg.due_at.slice(0, 16)}
                </p>
              ) : (
                <p
                  className={`flex items-center gap-1 ${archived ? 'text-gray-400 dark:text-gray-500' : 'text-amber-600'}`}
                  style={{ fontSize: `${auxSize}px` }}
                >
                  <BellRing className="w-3 h-3 flex-shrink-0" />
                  提醒：{msg.due_at.slice(0, 16)}
                </p>
              ))}
            {msg.todo_note && (
              <p
                className={archived ? 'text-gray-400 dark:text-gray-500' : 'text-amber-600'}
                style={{ fontSize: `${auxSize}px` }}
              >
                待办备注：{msg.todo_note}
              </p>
            )}
            {msg.note && (
              <p
                className={archived ? 'text-gray-400 dark:text-gray-500' : 'text-blue-500'}
                style={{ fontSize: `${auxSize}px` }}
              >
                公共备注：{msg.note}
              </p>
            )}
            {msg.my_note && (
              <p
                className={archived ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}
                style={{ fontSize: `${auxSize}px` }}
              >
                我的备注：{msg.my_note}
              </p>
            )}

            {/* 行 C：次要信息（日期 · 群名 · 昵称 · 归档图标），统一灰色 */}
            <div className="flex items-center gap-1.5 text-gray-400" style={{ fontSize: `${auxSize}px` }}>
              <span className="flex-shrink-0" title={`消息日期：${msg.created_at.slice(0, 10)}`}>
                {msg.created_at.slice(0, 10)}
              </span>
              <span className="truncate" title={`「${msg.group_name}」`}>
                「{msg.group_name}」
              </span>
              <span className="truncate" title={`发送者：${msg.nickname}`}>
                {msg.nickname}
              </span>
              {/* 已归档只显示 Archive 图标，不再重复文字 */}
              {archived && <Archive className="w-3.5 h-3.5 flex-shrink-0" />}
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export { Loader2 };
