import { Plus, Settings, Moon, Sun, Users, Hash, Search, ListTodo, Flag, Pin } from 'lucide-react';
import { User, Group } from '../api/types';
import { Avatar } from './Avatar';

type SidebarView = 'chats' | 'friends' | 'todos' | 'important';

interface SidebarProps {
  user: User;
  groups: Group[];
  currentGroupId: number | null;
  view: SidebarView;
  onSelectGroup: (id: number) => void;
  onCreateGroup: () => void;
  onOpenSettings: () => void;
  onSwitchView: (v: SidebarView) => void;
  onOpenSearch: () => void;
  onChangeAvatar: () => void;
  onTogglePin: (groupId: number, pinned: number) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Sidebar = ({
  user,
  groups,
  currentGroupId,
  view,
  onSelectGroup,
  onCreateGroup,
  onOpenSettings,
  onSwitchView,
  onOpenSearch,
  onChangeAvatar,
  onTogglePin,
  isDarkMode,
  onToggleDarkMode,
}: SidebarProps) => {
  // 全部群未读总数（聊天 tab 红点用）
  const totalUnread = groups.reduce((s, g) => s + (g.unread_count || 0), 0);
  const tabBtn = (active: boolean) =>
    `py-1.5 text-sm rounded-lg transition-colors ${
      active
        ? 'bg-green-500 text-white font-medium'
        : isDarkMode
          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`;
  return (
    <div
      className={`w-64 border-r flex flex-col h-full transition-colors duration-300 ${
        isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}
    >
      {/* 顶部标题 */}
      <div className={`p-4 border-b flex items-center justify-between ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center space-x-2">
          <div className="w-9 h-9 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center shadow">
            <Hash className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className={`text-base font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              smallChat
            </h1>
            <p className="text-xs text-gray-400 leading-tight">信息同步</p>
          </div>
        </div>
        <button
          onClick={onOpenSearch}
          className={`p-2 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700 hover:text-green-400' : 'text-gray-500 hover:bg-gray-100 hover:text-green-600'}`}
          title="搜索：找群 / 搜消息"
        >
          <Search className="w-5 h-5" />
        </button>
      </div>

      {/* 聊天 / 好友 / 待办 / 重要 切换 */}
      <div className="px-3 pt-3 grid grid-cols-4 gap-1.5">
        <button onClick={() => onSwitchView('chats')} className={`${tabBtn(view === 'chats')} relative`}>
          聊天
          {totalUnread > 0 && (
            <span className="absolute -top-1.5 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] leading-4 text-center font-bold">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
        <button onClick={() => onSwitchView('friends')} className={tabBtn(view === 'friends')}>好友</button>
        <button onClick={() => onSwitchView('todos')} className={`${tabBtn(view === 'todos')} flex items-center justify-center gap-1`}>
          <ListTodo className="w-3.5 h-3.5" />待办
        </button>
        <button onClick={() => onSwitchView('important')} className={`${tabBtn(view === 'important')} flex items-center justify-center gap-1`}>
          <Flag className="w-3.5 h-3.5" />重要
        </button>
      </div>

      {/* 建群 */}
      <div className="p-3">
        <button
          onClick={onCreateGroup}
          className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-green-500 to-green-600 text-white py-2.5 rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-md hover:shadow-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>新建群聊</span>
        </button>
      </div>

      {/* 群列表 */}
      <div className={`flex-1 overflow-y-auto px-2 pb-2 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        {groups.length === 0 ? (
          <div className="text-center text-sm text-gray-400 mt-10 px-4">
            还没有群聊
            <br />
            点击上方按钮创建一个吧
          </div>
        ) : (
          groups.map((g) => {
            const active = g.id === currentGroupId;
            const dmPeer = g.is_dm === 1 ? g.dm_peer : null;
            return (
              <div
                key={g.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectGroup(g.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectGroup(g.id);
                  }
                }}
                className={`group w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-colors ${
                  active
                    ? isDarkMode
                      ? 'bg-gray-700'
                      : 'bg-green-100'
                    : isDarkMode
                      ? 'hover:bg-gray-700/60'
                      : 'hover:bg-gray-200/70'
                }`}
              >
                <div className="relative flex-shrink-0">
                  {dmPeer ? (
                    <Avatar
                      userId={dmPeer.id}
                      nickname={dmPeer.nickname}
                      color={dmPeer.color}
                      avatarVer={dmPeer.avatar_ver}
                      size={40}
                      className="rounded-lg"
                    />
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        active ? 'bg-green-500 text-white' : isDarkMode ? 'bg-gray-600 text-gray-300' : 'bg-white text-green-600 shadow-sm'
                      }`}
                    >
                      <Users className="w-5 h-5" />
                    </div>
                  )}
                  {(g.unread_count || 0) > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] text-center font-bold">
                      {g.unread_count > 99 ? '99+' : g.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      active
                        ? isDarkMode
                          ? 'text-white'
                          : 'text-green-800'
                        : isDarkMode
                          ? 'text-gray-200'
                          : 'text-gray-800'
                    }`}
                  >
                    {dmPeer ? dmPeer.nickname : g.remark || g.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {dmPeer ? '私聊' : `${g.member_count} 位成员`}
                    {g.is_archived === 1 && ' · 已停用'}
                  </p>
                </div>
                {(() => {
                  // 三态循环：0普通 → 1普通置顶 → 2超级置顶 → 0普通
                  const st = g.pinned_chat || 0;
                  const next = st >= 2 ? 0 : st + 1;
                  const pinColor =
                    st === 2
                      ? 'text-red-500 hover:text-red-600'
                      : st === 1
                        ? 'text-green-500 hover:text-green-600'
                        : isDarkMode
                          ? 'text-gray-600 hover:text-gray-300'
                          : 'text-gray-300 hover:text-gray-500';
                  const pinTitle = st === 2 ? '取消置顶' : st === 1 ? '超级置顶' : '置顶会话';
                  return (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(g.id, next);
                      }}
                      title={pinTitle}
                      className={`flex-shrink-0 p-1 rounded ${pinColor}`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* 底部用户区 */}
      <div className={`p-3 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className={`flex items-center space-x-3 mb-3 px-1 py-2 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
          <Avatar
            userId={user.id}
            nickname={user.nickname}
            color={user.color}
            avatarVer={user.avatar_ver}
            size={36}
            onClick={onChangeAvatar}
            className="ring-2 ring-transparent hover:ring-green-400 transition-all"
          />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              {user.nickname}
            </p>
            <p className="text-xs text-gray-400 truncate">@{user.username}</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-1">
          <button
            onClick={onToggleDarkMode}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title={isDarkMode ? '切换到浅色模式' : '切换到深色模式'}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={onOpenSettings}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title="设置"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
