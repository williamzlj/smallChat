import { Plus, Settings, Moon, Sun, Users, Hash } from 'lucide-react';
import { User, Group } from '../api/types';

interface SidebarProps {
  user: User;
  groups: Group[];
  currentGroupId: number | null;
  onSelectGroup: (id: number) => void;
  onCreateGroup: () => void;
  onOpenSettings: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Sidebar = ({
  user,
  groups,
  currentGroupId,
  onSelectGroup,
  onCreateGroup,
  onOpenSettings,
  isDarkMode,
  onToggleDarkMode,
}: SidebarProps) => {
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
            return (
              <button
                key={g.id}
                onClick={() => onSelectGroup(g.id)}
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
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    active ? 'bg-green-500 text-white' : isDarkMode ? 'bg-gray-600 text-gray-300' : 'bg-white text-green-600 shadow-sm'
                  }`}
                >
                  <Users className="w-5 h-5" />
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
                    {g.name}
                  </p>
                  <p className="text-xs text-gray-400">{g.member_count} 位成员</p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 底部用户区 */}
      <div className={`p-3 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className={`flex items-center space-x-3 mb-3 px-1 py-2 rounded-lg ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: user.color }}
          >
            {user.nickname.slice(0, 1).toUpperCase()}
          </div>
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
