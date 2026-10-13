import { useState, useRef, useEffect } from 'react';
import { Copy, Trash2, Download, FileText, AlertCircle, Clock, CheckCheck } from 'lucide-react';
import { ChatMessage } from '../api/types';
import { fileUrl } from '../config';

interface Props {
  message: ChatMessage;
  isSelf: boolean;
  canDelete: boolean;
  onDelete: (id: number) => Promise<void> | void;
  isDarkMode: boolean;
  fontSize: number;
}

function shortTime(createdAt: string): string {
  // 后端格式 Y-m-d H:i:s
  return createdAt.length >= 16 ? createdAt.slice(11, 16) : createdAt;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const MessageBubble = ({ message, isSelf, canDelete, onDelete, isDarkMode, fontSize }: Props) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const openMenu = () => {
    if (!bubbleRef.current) return;
    const rect = bubbleRef.current.getBoundingClientRect();
    const menuW = 168;
    const menuH = 130;
    let x = isSelf ? rect.right - menuW : rect.left;
    let y = rect.bottom + 6;
    if (x < 8) x = 8;
    if (x + menuW > window.innerWidth - 8) x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight - 8) y = rect.top - menuH - 6;
    setMenuPos({ x, y });
    setShowMenu(true);
  };

  const startPress = () => {
    pressTimer.current = setTimeout(openMenu, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      // 忽略
    }
    setShowMenu(false);
  };

  const handleDelete = () => {
    setShowMenu(false);
    if (confirm('确定删除这条消息吗？删除后群内所有设备都会显示"已删除"。')) {
      Promise.resolve(onDelete(message.id)).catch((e: unknown) =>
        alert(e instanceof Error ? e.message : '删除失败'),
      );
    }
  };

  const openFile = () => {
    if (message.file) window.open(fileUrl(message.file.url), '_blank');
  };

  if (message.deleted === 1) {
    return (
      <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'} mb-3`}>
        <div className="text-xs text-gray-400 italic px-3 py-1">该消息已删除</div>
      </div>
    );
  }

  return (
    <>
      <div className={`flex ${isSelf ? 'justify-end' : 'justify-start'} mb-3`}>
        <div
          ref={bubbleRef}
          className={`max-w-[78%] sm:max-w-[70%] select-none ${isSelf ? 'items-end' : 'items-start'} flex flex-col`}
          onMouseDown={startPress}
          onMouseUp={cancelPress}
          onMouseLeave={cancelPress}
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          onTouchCancel={cancelPress}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu();
          }}
        >
          {/* 昵称（非自己时显示） */}
          {!isSelf && (
            <span className="text-xs mb-1 px-1 font-medium" style={{ color: message.color }}>
              {message.nickname}
            </span>
          )}

          <div
            className={`relative px-3.5 py-2 rounded-2xl shadow-sm transition-opacity ${
              isSelf
                ? 'bg-green-500 text-white rounded-br-md'
                : isDarkMode
                  ? 'bg-gray-700 text-gray-100 rounded-bl-md'
                  : 'bg-white text-gray-800 rounded-bl-md'
            } ${message.status === 'sending' ? 'opacity-60' : ''} ${message.status === 'failed' ? 'ring-2 ring-red-400' : ''}`}
          >
            {/* 文本 */}
            {message.type === 'text' && message.content && (
              <p className="whitespace-pre-wrap break-words" style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}>
                {message.content}
              </p>
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
                className={`flex items-center space-x-3 max-w-xs ${isSelf ? 'text-white' : isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}
              >
                <span className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelf ? 'bg-green-600/60' : 'bg-green-100'}`}>
                  <FileText className={`w-5 h-5 ${isSelf ? 'text-white' : 'text-green-600'}`} />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-medium truncate">{message.file.name}</span>
                  <span className={`block text-xs ${isSelf ? 'text-green-100' : 'text-gray-400'}`}>
                    {formatFileSize(message.file.size)}
                  </span>
                </span>
                <Download className="w-4 h-4 flex-shrink-0 opacity-70" />
              </button>
            )}

            {/* 时间 + 状态 */}
            <div className={`flex items-center gap-1 mt-1 justify-end ${isSelf ? 'text-green-100' : 'text-gray-400'}`}>
              {message.status === 'sending' && <Clock className="w-3 h-3" />}
              {message.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-300" />}
              {!message.status && isSelf && <CheckCheck className="w-3 h-3 opacity-70" />}
              <span style={{ fontSize: `${fontSize - 3}px` }}>{shortTime(message.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {showMenu && (
        <div
          ref={menuRef}
          className={`fixed z-50 rounded-xl shadow-xl border py-1.5 min-w-[168px] ${
            isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
          }`}
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <p className={`text-xs px-3 py-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>消息操作</p>
          {message.type === 'text' && message.content && (
            <button
              onClick={copyText}
              className={`w-full flex items-center space-x-2 px-3 py-2 text-sm ${
                isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Copy className="w-4 h-4" />
              <span>复制文本</span>
            </button>
          )}
          {(message.type === 'image' || message.type === 'file') && message.file && (
            <button
              onClick={() => {
                setShowMenu(false);
                openFile();
              }}
              className={`w-full flex items-center space-x-2 px-3 py-2 text-sm ${
                isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
              }`}
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
      )}
    </>
  );
};
