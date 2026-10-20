import { useState } from 'react';
import { ArrowLeft, UserPlus, UserRound } from 'lucide-react';
import { Friend } from '../api/types';

interface Props {
  friends: Friend[];
  currentFriendId: number | null;
  onSelectFriend: (f: Friend) => void;
  onAdd: (username: string) => Promise<void>;
  onBack: () => void;
  isDarkMode: boolean;
}

// 侧边栏好友面板（替代群列表）
export const FriendsPanel = ({ friends, currentFriendId, onSelectFriend, onAdd, onBack, isDarkMode }: Props) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const uname = name.trim();
    if (!uname || busy) return;
    setError('');
    setOk('');
    setBusy(true);
    try {
      await onAdd(uname);
      setOk(`已添加好友 @${uname}`);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '添加失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`w-64 border-r flex flex-col h-full transition-colors duration-300 ${
        isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}
    >
      {/* 顶部 */}
      <div className={`p-4 border-b flex items-center space-x-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          onClick={onBack}
          className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
          title="返回聊天"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>好友</h1>
        <span className="text-xs text-gray-400">（{friends.length}）</span>
      </div>

      {/* 添加好友 */}
      <div className="p-3">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="输入用户名添加好友"
            className={`flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-green-500 min-w-0 ${
              isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'
            }`}
          />
          <button
            onClick={() => void submit()}
            disabled={busy || !name.trim()}
            className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex-shrink-0"
            title="添加好友"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="text-sm text-red-500 mt-1.5">{error}</p>}
        {ok && <p className="text-sm text-green-600 mt-1.5">{ok}</p>}
      </div>

      {/* 好友列表 */}
      <div className={`flex-1 overflow-y-auto px-2 pb-2 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        {friends.length === 0 ? (
          <div className="text-center text-sm text-gray-400 mt-10 px-4">
            还没有好友
            <br />
            在上方输入用户名添加
          </div>
        ) : (
          friends.map((f) => {
            const active = f.id === currentFriendId;
            return (
              <button
                key={f.id}
                onClick={() => onSelectFriend(f)}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-colors ${
                  active
                    ? isDarkMode
                      ? 'bg-gray-700'
                      : 'bg-green-100'
                    : isDarkMode
                      ? 'hover:bg-gray-700/60'
                      : 'hover:bg-gray-200/70'
                }`}
              >
                <span
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ backgroundColor: f.color }}
                >
                  {(f.alias || f.nickname).slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className={`block text-sm font-medium truncate ${
                      active
                        ? isDarkMode
                          ? 'text-white'
                          : 'text-green-800'
                        : isDarkMode
                          ? 'text-gray-200'
                          : 'text-gray-800'
                    }`}
                  >
                    {f.alias || f.nickname}
                  </span>
                  <span className="block text-xs text-gray-400 truncate">
                    {f.alias ? `昵称：${f.nickname}` : `@${f.username}`}
                  </span>
                </span>
                <UserRound className={`w-4 h-4 flex-shrink-0 ${active ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
