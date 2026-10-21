import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../api/types';
import { MessageBubble } from './MessageBubble';
import { MessagesSquare, Loader2, ArrowUp, Inbox, CheckCircle2, Circle, SendHorizontal, X, Copy, ImageDown } from 'lucide-react';

interface Props {
  messages: ChatMessage[];
  currentUserId: number;
  ownerId: number;
  canManage: boolean; // 当前用户是否可管理（群主/副群主；私聊恒 true）
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  todoOnly: boolean; // 只看待办
  showCompletedTodo: boolean; // 只看待办时是否同时显示已完成
  importantOnly: boolean; // 只看重要消息（有颜色标记）
  pinnedMsgIds: number[];
  isDm: boolean;
  peerLastReadId: number; // 私聊对方的已读位置
  onLoadMore: () => void;
  onDeleteMessage: (id: number) => Promise<void>;
  onRecallMessage: (id: number) => Promise<void>; // 撤回自己的消息（2 分钟内）
  recalledDrafts: Record<number, { content: string; at: number }>; // 撤回消息的「重新编辑」内容（撤回时间起 5 分钟内有效）
  onReEditRecord: (id: number, content: string) => void; // 撤回成功后记录内容
  onReEdit: (id: number, text: string) => void; // 点击「重新编辑」：填回输入框
  onForwardSingle: (msg: ChatMessage, withSource?: boolean) => void; // 单条转发到其他群
  onSetTodo: (msg: ChatMessage, status: number, note?: string) => void;
  onSetDue?: (msg: ChatMessage) => void;
  onSetColor: (msg: ChatMessage, color: number) => void;
  onSetAmount?: (msg: ChatMessage) => void; // 记账/改金额（群主/副群主或私聊）
  onDelegateAmount?: (msg: ChatMessage) => void; // 普通成员委托记账
  ledgerEnabled: boolean; // 该会话是否开启财务记账（未开启则不显示金额徽章与记账入口）
  onSetNote: (msg: ChatMessage, note: string, scope: 'private' | 'public') => Promise<void> | void;
  privateNotes: Record<number, string>;
  onAvatarClick: (userId: number) => void; // 点击头像查看用户详情
  onStartReply: (msg: ChatMessage) => void;
  onTogglePin: (msg: ChatMessage) => void;
  onShareCard: (msg: ChatMessage) => void; // 生成分享卡片（单条）
  onShareCardMulti: (msgs: ChatMessage[]) => void; // 多选消息合成一张分享卡片（按时间正序）
  onForwardMessages: (msgs: ChatMessage[]) => void;
  isDarkMode: boolean;
  fontSize: number;
  bubbleStyle: 'green' | 'white'; // 我的气泡样式：green 经典绿底 / white 简洁白底
  groupName: string;
  highlightMsgId: number | null; // 面板跳转定位的目标消息
  onHighlightDone: () => void; // 高亮展示完毕回调（清除定位态）
}

function dayLabel(dateStr: string): string {
  // dateStr: Y-m-d H:i:s
  if (dateStr.length < 10) return '';
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return dateStr.slice(0, 10);
}

// 可被多选转发的消息（排除临时/已删除/转发嵌套）
function selectable(m: ChatMessage): boolean {
  return m.id > 0 && m.deleted === 0 && m.type !== 'forward';
}

export const MessageList = ({
  messages,
  currentUserId,
  ownerId,
  canManage,
  loading,
  loadingMore,
  hasMore,
  todoOnly,
  showCompletedTodo,
  importantOnly,
  pinnedMsgIds,
  isDm,
  peerLastReadId,
  onLoadMore,
  onDeleteMessage,
  onRecallMessage,
  recalledDrafts,
  onReEditRecord,
  onReEdit,
  onForwardSingle,
  onSetTodo,
  onSetDue,
  onSetColor,
  onSetAmount,
  onDelegateAmount,
  ledgerEnabled,
  onSetNote,
  privateNotes,
  onAvatarClick,
  onStartReply,
  onTogglePin,
  onShareCard,
  onShareCardMulti,
  onForwardMessages,
  isDarkMode,
  fontSize,
  bubbleStyle,
  groupName,
  highlightMsgId,
  onHighlightDone,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevFirstIdRef = useRef<number | null>(null);

  // 多选模式（合并转发）
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const enterSelect = (msg: ChatMessage) => {
    if (!selectable(msg)) return;
    setSelectMode(true);
    setSelected(new Set([msg.id]));
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const toggleSelect = (m: ChatMessage) => {
    if (!selectable(m)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      return next;
    });
  };
  const confirmForward = () => {
    const list = messages
      .filter((m) => selected.has(m.id) && selectable(m))
      .sort((a, b) => a.id - b.id);
    exitSelect();
    if (list.length > 0) onForwardMessages(list);
  };

  // 合并复制：把选中消息按时间序拼成纯文本进剪贴板（方便粘贴到 Word 继续编辑）
  const [copyHint, setCopyHint] = useState('');
  const confirmCopy = async () => {
    const list = messages
      .filter((m) => selected.has(m.id) && selectable(m))
      .sort((a, b) => a.id - b.id);
    if (list.length === 0) return;
    const text = list
      .map((m) => {
        const body =
          m.type === 'image'
            ? '[图片]'
            : m.type === 'file'
              ? `[文件] ${m.file?.name ?? ''}`
              : m.type === 'forward'
                ? '[合并转发消息]'
                : m.content;
        return `[${m.created_at.slice(0, 16)}] ${m.nickname}：${body}`;
      })
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 剪贴板 API 不可用时的降级方案
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopyHint('已复制到剪贴板');
    setTimeout(() => setCopyHint(''), 1500);
    exitSelect();
  };

  // 多选生成卡片：选中消息（按时间正序）合成一张图文混排分享卡片，上限 CARD_MAX 条
  const CARD_MAX = 20;
  const confirmShareCard = () => {
    const list = messages
      .filter((m) => selected.has(m.id) && selectable(m))
      .sort((a, b) => a.id - b.id);
    if (list.length === 0) return;
    if (list.length > CARD_MAX) {
      setCopyHint(`一次最多生成 ${CARD_MAX} 条`);
      setTimeout(() => setCopyHint(''), 1500);
      return;
    }
    exitSelect();
    onShareCardMulti(list);
  };

  // 只看待办：未完成(1)，勾选后包含已完成(2)；或只看重要消息（红/橙/蓝标记）
  const shown = importantOnly
    ? messages.filter((m) => m.color_mark > 0)
    : todoOnly
      ? messages.filter((m) => m.todo_status === 1 || (showCompletedTodo && m.todo_status === 2))
      : messages;

  // 监听滚动位置，决定是否"贴着底部"
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // 初次加载/切群：滚到底（面板定位跳转除外，定位由下面的 effect 处理）
  useEffect(() => {
    if (!loading && messages.length > 0 && !highlightMsgId) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
      stickToBottomRef.current = true;
      prevFirstIdRef.current = messages[0]?.id ?? null;
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 面板跳转定位：消息渲染后滚动到目标并居中高亮，3 秒后取消高亮
  useEffect(() => {
    if (loading || !highlightMsgId) return;
    if (!messages.some((m) => m.id === highlightMsgId)) return;
    const el = document.getElementById(`msg-${highlightMsgId}`);
    if (!el) return;
    stickToBottomRef.current = false; // 定位到中间，不要被新消息自动滚底打断
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(() => onHighlightDone(), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, highlightMsgId, messages]);

  // 新消息：贴底时自动滚；加载历史时保持原位置（靠浏览器锚点，简单处理）
  useEffect(() => {
    const firstId = messages[0]?.id ?? null;
    const loadingHistory = prevFirstIdRef.current !== null && firstId !== prevFirstIdRef.current && messages.length > 0;
    if (!loadingHistory && stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    prevFirstIdRef.current = firstId;
  }, [messages]);

  if (loading) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center ${isDarkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
        <Loader2 className="w-8 h-8 animate-spin mb-2" />
        <p className="text-sm">加载中…</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto chat-container ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}
      >
        <div className="px-3 sm:px-6 py-4 max-w-3xl mx-auto">
          {/* 历史加载 */}
          <div className="text-center mb-3">
            {hasMore ? (
              <button
                onClick={onLoadMore}
                disabled={loadingMore}
                className={`inline-flex items-center space-x-1.5 text-sm px-4 py-1.5 rounded-full transition-colors ${
                  isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-600 hover:bg-gray-200 shadow-sm'
                } disabled:opacity-60`}
              >
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                <span>{loadingMore ? '加载中…' : '加载更早的消息'}</span>
              </button>
            ) : (
              messages.length > 0 && (
                <div className="flex items-center justify-center space-x-2 text-xs text-gray-400 py-1">
                  <span className="w-8 h-px bg-gray-300 dark:bg-gray-600" />
                  <span>没有更早的消息了</span>
                  <span className="w-8 h-px bg-gray-300 dark:bg-gray-600" />
                </div>
              )
            )}
          </div>

          {messages.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-full min-h-[50vh] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-gray-700' : 'bg-green-100'}`}>
                <MessagesSquare className={`w-10 h-10 ${isDarkMode ? 'text-gray-500' : 'text-green-500'}`} />
              </div>
              <p className={`text-base font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                「{groupName}」还没有消息
              </p>
              <p className="text-sm mt-1 text-gray-400 flex items-center">
                <Inbox className="w-4 h-4 mr-1" />
                在下方输入内容开始记录吧
              </p>
            </div>
          ) : shown.length === 0 && todoOnly ? (
            <div className="text-center text-sm text-gray-400 py-10">
              {showCompletedTodo ? '没有待办事项' : '没有未完成的待办事项'}
            </div>
          ) : shown.length === 0 && importantOnly ? (
            <div className="text-center text-sm text-gray-400 py-10">没有重要消息，右键消息可标记红/橙/蓝</div>
          ) : (
            shown.map((m, idx) => {
              const prevDate = idx > 0 ? shown[idx - 1].created_at.slice(0, 10) : '';
              const curDate = m.created_at.slice(0, 10);
              const showDate = curDate !== prevDate;
              const isSelf = m.user_id === currentUserId;
              // 仅群主/副群主可删除消息（私聊双方都不能删）；普通成员只能撤回自己 2 分钟内的消息
              const canDelete = !isDm && (ownerId === currentUserId || canManage);
              const peerRead = isDm && isSelf && m.id > 0 && m.id <= peerLastReadId;
              return (
                <div key={m.clientTempId ? `tmp-${m.clientTempId}` : m.id}>
                  {showDate && (
                    <div className="text-center my-4">
                      <span className={`text-xs px-3 py-1 rounded-full ${isDarkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-300/60 text-gray-600'}`}>
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <div
                    className={`flex items-center ${selectMode ? 'cursor-pointer rounded-lg' : ''}`}
                    onClick={selectMode ? () => toggleSelect(m) : undefined}
                  >
                    {selectMode && (
                      <span className="mr-1.5 flex-shrink-0">
                        {selected.has(m.id) ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <Circle className={`w-5 h-5 ${selectable(m) ? 'text-gray-400' : 'text-gray-300 dark:text-gray-600'}`} />
                        )}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <MessageBubble
                        message={m}
                        isSelf={isSelf}
                        canDelete={canDelete}
                        canManage={canManage}
                        isPinned={pinnedMsgIds.includes(m.id)}
                        isDm={isDm}
                        peerRead={peerRead}
                        selectMode={selectMode}
                        onDelete={onDeleteMessage}
                        onRecall={onRecallMessage}
                        reEdit={recalledDrafts[m.id]}
                        onReEdit={onReEdit}
                        onReEditRecord={onReEditRecord}
                        onForwardSingle={onForwardSingle}
                        onSetTodo={onSetTodo}
                        onSetDue={onSetDue}
                        onSetColor={onSetColor}
                        onSetAmount={onSetAmount}
                        onDelegateAmount={onDelegateAmount}
                        ledgerEnabled={ledgerEnabled}
                        onSetNote={onSetNote}
                        privateNotes={privateNotes}
                        onAvatarClick={onAvatarClick}
                        onStartReply={onStartReply}
                        onTogglePin={onTogglePin}
                        onShareCard={onShareCard}
                        onEnterSelect={enterSelect}
                        isDarkMode={isDarkMode}
                        fontSize={fontSize}
                        bubbleStyle={bubbleStyle}
                        highlighted={highlightMsgId === m.id}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 多选操作栏 */}
      {selectMode && (
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-x-3 gap-y-3 px-4 py-3 sm:gap-y-2 sm:py-2.5 sm:pr-10 rounded-2xl shadow-xl border max-w-[calc(100%-1.5rem)] ${
            isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-200 text-gray-800'
          }`}
        >
          <span className="text-sm whitespace-nowrap flex-shrink-0">{copyHint || `已选 ${selected.size} 条`}</span>
          <button
            onClick={confirmCopy}
            disabled={selected.size === 0}
            className={`flex items-center space-x-1.5 px-4 py-2.5 text-base rounded-full disabled:opacity-50 whitespace-nowrap flex-shrink-0 sm:space-x-1 sm:px-3 sm:py-1.5 sm:text-sm ${
              isDarkMode ? 'bg-gray-600 text-gray-100 hover:bg-gray-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Copy className="w-5 h-5 sm:w-4 sm:h-4" />
            <span>合并复制</span>
          </button>
          <button
            onClick={confirmShareCard}
            disabled={selected.size === 0}
            className={`flex items-center space-x-1.5 px-4 py-2.5 text-base rounded-full disabled:opacity-50 whitespace-nowrap flex-shrink-0 sm:space-x-1 sm:px-3 sm:py-1.5 sm:text-sm ${
              isDarkMode ? 'bg-gray-600 text-gray-100 hover:bg-gray-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <ImageDown className="w-5 h-5 sm:w-4 sm:h-4" />
            <span>生成卡片</span>
          </button>
          <button
            onClick={confirmForward}
            disabled={selected.size === 0}
            className="flex items-center space-x-1.5 px-4 py-2.5 text-base rounded-full bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 whitespace-nowrap flex-shrink-0 sm:space-x-1 sm:px-3 sm:py-1.5 sm:text-sm"
          >
            <SendHorizontal className="w-5 h-5 sm:w-4 sm:h-4" />
            <span>合并转发</span>
          </button>
          <button
            onClick={exitSelect}
            className={`absolute top-1 right-1 p-1 rounded-full ${isDarkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-100'}`}
            title="取消"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
