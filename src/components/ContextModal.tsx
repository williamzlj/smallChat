// “查看该消息上下文”弹窗：展示目标消息前后各 5 条，不必跳转到聊天窗口
import { useEffect, useState } from 'react';
import { X, Loader2, MessagesSquare, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import { ChatMessage } from '../api/types';

interface Props {
  messageId: number;
  isDarkMode: boolean;
  fontSize: number;
  onClose: () => void;
  onJump?: (groupId: number, messageId: number) => void;
}

const contentText = (m: ChatMessage): string => {
  if (m.recalled === 1 || m.deleted === 1) return '该消息已被撤回';
  if (m.type === 'image') return '[图片]';
  if (m.type === 'file') return `[文件] ${m.content}`;
  if (m.type === 'forward') return '[聊天记录]';
  return m.content;
};

export const ContextModal = ({ messageId, isDarkMode, fontSize, onClose, onJump }: Props) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [list, setList] = useState<ChatMessage[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isDm, setIsDm] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .messagesContext(messageId)
      .then((data) => {
        if (cancelled) return;
        setList(data.messages);
        setGroupName(data.group?.name ?? '');
        setIsDm(data.group?.is_dm ?? 0);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 字号规则与待办/重要面板一致（汇总查看，不需要聊天区那么大）
  const auxSize = Math.max(fontSize - 6, 14);
  const contentSize = Math.max(fontSize - 4, 14);
  const bubbleMax = 420;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-2xl shadow-2xl flex flex-col max-h-[85vh] ${
          isDarkMode ? 'bg-gray-800' : 'bg-white'
        }`}
        style={{ maxWidth: bubbleMax }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-4 py-3 border-b flex-shrink-0 ${
            isDarkMode ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 min-w-0">
              <MessagesSquare className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <p className={`font-medium truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                消息上下文
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-1 rounded-lg flex-shrink-0 ${
                isDarkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {groupName && (
            <p className="text-gray-400 mt-0.5" style={{ fontSize: auxSize }}>
              来自{isDm === 1 ? '私聊' : '群聊'}「{groupName}」
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              加载中…
            </div>
          )}
          {error && <p className="text-sm text-red-500 text-center py-10">{error}</p>}
          {!loading && !error && list.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">未找到上下文消息</p>
          )}
          {!loading &&
            !error &&
            list.map((m) => {
              const isTarget = m.id === messageId;
              const gone = m.recalled === 1 || m.deleted === 1;
              return (
                <div
                  key={m.id}
                  className={`rounded-xl px-3 py-2 transition-colors ${
                    isTarget
                      ? isDarkMode
                        ? 'bg-blue-900/40 ring-2 ring-blue-500'
                        : 'bg-blue-50 ring-2 ring-blue-400'
                      : isDarkMode
                        ? 'bg-gray-700/50'
                        : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span
                      className="font-medium truncate"
                      style={{ color: m.color, fontSize: auxSize }}
                    >
                      {m.nickname}
                    </span>
                    <span className="text-gray-400 flex-shrink-0" style={{ fontSize: auxSize }}>
                      {m.created_at.slice(0, 16)}
                    </span>
                  </div>
                  <p
                    className={`break-words whitespace-pre-wrap ${
                      gone ? 'text-gray-400 italic' : isDarkMode ? 'text-gray-200' : 'text-gray-700'
                    }`}
                    style={{ fontSize: contentSize }}
                  >
                    {contentText(m)}
                  </p>
                  {isTarget && (
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-blue-500" style={{ fontSize: auxSize }}>
                        ▸ 当前消息
                      </span>
                      {onJump && (
                        <button
                          onClick={() => onJump(m.group_id, m.id)}
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                            isDarkMode
                              ? 'text-blue-400 hover:bg-blue-900/40'
                              : 'text-blue-600 hover:bg-blue-50'
                          }`}
                          style={{ fontSize: auxSize }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          在聊天中查看
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
