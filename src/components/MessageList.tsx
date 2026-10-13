import { useEffect, useRef } from 'react';
import { ChatMessage } from '../api/types';
import { MessageBubble } from './MessageBubble';
import { MessagesSquare, Loader2, ArrowUp, Inbox } from 'lucide-react';

interface Props {
  messages: ChatMessage[];
  currentUserId: number;
  ownerId: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onDeleteMessage: (id: number) => Promise<void>;
  isDarkMode: boolean;
  fontSize: number;
  groupName: string;
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

export const MessageList = ({
  messages,
  currentUserId,
  ownerId,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  onDeleteMessage,
  isDarkMode,
  fontSize,
  groupName,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const prevFirstIdRef = useRef<number | null>(null);

  // 监听滚动位置，决定是否"贴着底部"
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // 初次加载/切群：滚到底
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
      stickToBottomRef.current = true;
      prevFirstIdRef.current = messages[0]?.id ?? null;
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

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
        ) : (
          messages.map((m, idx) => {
            const prevDate = idx > 0 ? messages[idx - 1].created_at.slice(0, 10) : '';
            const curDate = m.created_at.slice(0, 10);
            const showDate = curDate !== prevDate;
            const isSelf = m.user_id === currentUserId;
            // 群主可删任何人消息，成员只能删自己的
            const canDelete = isSelf || ownerId === currentUserId;
            return (
              <div key={m.clientTempId ? `tmp-${m.clientTempId}` : m.id}>
                {showDate && (
                  <div className="text-center my-4">
                    <span className={`text-xs px-3 py-1 rounded-full ${isDarkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-300/60 text-gray-600'}`}>
                      {dayLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  key={m.clientTempId ? `tmp-${m.clientTempId}` : m.id}
                  message={m}
                  isSelf={isSelf}
                  canDelete={canDelete}
                  onDelete={onDeleteMessage}
                  isDarkMode={isDarkMode}
                  fontSize={fontSize}
                />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
