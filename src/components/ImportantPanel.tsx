import { useState, useEffect, useCallback } from 'react';
import { Flag, Loader2, Menu, X, Download, Copy, Archive } from 'lucide-react';
import { api } from '../api/client';
import { CrossGroupMessage, GroupRole } from '../api/types';
import { usePanelMenu, PanelItem, msgLine, msgText, PanelAction } from './PanelShared';
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

type Tab = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

// 颜色语义：红=危险特别留意 橘=积极给人力量 黄=关心的事情 绿=读书笔记时文阅读 蓝=业务流程备注 紫=想法创意 灰=高于普通的关注事项
const colorMap: Record<Tab, number> = { red: 1, orange: 2, yellow: 6, green: 7, blue: 3, purple: 5, gray: 4 };
const colorLabel: Record<Tab, string> = { red: '红色', orange: '橘色', yellow: '黄色', green: '绿色', blue: '蓝色', purple: '紫色', gray: '灰色' };
const colorDot: Record<Tab, string> = { red: 'bg-red-500', orange: 'bg-orange-400', yellow: 'bg-yellow-400', green: 'bg-green-500', blue: 'bg-blue-500', purple: 'bg-purple-500', gray: 'bg-gray-500' };
const colorActive: Record<Tab, string> = { red: 'bg-red-500', orange: 'bg-orange-400', yellow: 'bg-yellow-500', green: 'bg-green-500', blue: 'bg-blue-500', purple: 'bg-purple-500', gray: 'bg-gray-500' };

// 跨群重要消息面板：红 / 橘 / 黄 / 绿 / 蓝 / 紫 / 灰，支持右键改色、归档、多选合并复制、查看按钮
export const ImportantPanel = ({ isDarkMode, fontSize, onJump, onToggleSidebar, sidebarOpen, roleOf, onDelegate }: Props) => {
  const [tab, setTab] = useState<Tab>('red');
  const [showArchived, setShowArchived] = useState(false);
  const [messages, setMessages] = useState<CrossGroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // 上下文弹窗
  const [contextMsg, setContextMsg] = useState<CrossGroupMessage | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { messages: list } = await api.messagesImportant();
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

  const handleAction = async (action: PanelAction, msg: CrossGroupMessage, batchIds?: number[]) => {
    const ids = batchIds && batchIds.length > 0 ? batchIds : [msg.id];
    try {
      if (action.type === 'color') {
        await Promise.all(ids.map((id) => api.messagesSetColor(id, action.color)));
        setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, color_mark: action.color } : m)));
        return;
      } else if (action.type === 'archived') {
        await Promise.all(ids.map((id) => api.messagesSetArchived(id, action.archived, 'important')));
        setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, important_archived: action.archived } : m)));
        return;
      } else if (action.type === 'copy') {
        const list = batchIds && batchIds.length > 0
          ? messages.filter((m) => batchIds.includes(m.id))
          : [msg];
        await navigator.clipboard.writeText(list.map(msgLine).join('\n'));
        setExportMsg(batchIds && batchIds.length > 0 ? `已复制 ${list.length} 条` : '已复制');
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

  const { openMenu, menuEl, selTextId, setSelTextId } = usePanelMenu({ isDarkMode, mode: 'important', onAction: handleAction, canManageOf, selectMode, selectedIds: selected });

  const filtered = messages.filter(
    (m) => m.color_mark === colorMap[tab] && (showArchived ? true : m.important_archived === 0),
  );

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
    const list = filtered.filter((m) => selected.has(m.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
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
      const archived = m.important_archived === 1 ? ' [已归档]' : '';
      return `[${m.created_at}] ${m.nickname}（${where}）：${msgText(m)}${archived}`;
    };
    const groups: Record<number, CrossGroupMessage[]> = { 1: [], 2: [], 6: [], 7: [], 3: [], 4: [], 5: [] };
    messages.forEach((m) => {
      if (m.color_mark > 0 && groups[m.color_mark]) groups[m.color_mark].push(m);
    });
    Object.values(groups).forEach((arr) => arr.sort((a, b) => a.created_at.localeCompare(b.created_at)));
    const total = Object.values(groups).reduce((s, arr) => s + arr.length, 0);
    const header = `# 全部重要消息\n# 导出时间: ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}\n# 红 ${groups[1].length} 条 / 橘 ${groups[2].length} 条 / 黄 ${groups[6].length} 条 / 绿 ${groups[7].length} 条 / 蓝 ${groups[3].length} 条 / 紫 ${groups[5].length} 条 / 灰 ${groups[4].length} 条\n`;
    const body = [
      '【红色】',
      ...groups[1].map(lineOf),
      '',
      '【橘色】',
      ...groups[2].map(lineOf),
      '',
      '【黄色】',
      ...groups[6].map(lineOf),
      '',
      '【绿色】',
      ...groups[7].map(lineOf),
      '',
      '【蓝色】',
      ...groups[3].map(lineOf),
      '',
      '【紫色】',
      ...groups[5].map(lineOf),
      '',
      '【灰色】',
      ...groups[4].map(lineOf),
    ].join('\n');
    const blob = new Blob([`${header}\n${body}\n`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `重要消息-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExportMsg(`已导出 ${total} 条`);
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
          <h2 className={`text-base font-semibold ml-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>重要消息</h2>
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
            title="导出重要消息（txt）"
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
        {(Object.keys(colorMap) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              tab === t
                ? `${colorActive[t]} text-white`
                : isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-white text-gray-600'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${colorDot[t]} ${tab === t ? 'ring-1 ring-white' : ''}`} />
            {colorLabel[t]}
          </button>
        ))}
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Flag className="w-12 h-12 mb-2" />
            <p className="text-sm">没有{colorLabel[tab]}标记的重要消息</p>
          </div>
        ) : (
          filtered.map((m) => (
            <PanelItem
              key={m.id}
              msg={m}
              isDarkMode={isDarkMode}
              fontSize={fontSize}
              mode="important"
              selected={selected.has(m.id)}
              selectMode={selectMode}
              selectable={selTextId === m.id}
              canDelegate={canDelegateOf(m)}
              onDelegate={(msg) => onDelegate(msg.group_id, msgText(msg).slice(0, 30), 'important')}
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
