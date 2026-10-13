import { useState, useEffect, useMemo } from 'react';
import { Menu, X, Info, Hash } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { InputBox } from './components/InputBox';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ProfileSettings } from './components/Auth/ProfileSettings';
import { CreateGroupModal } from './components/Group/CreateGroupModal';
import { GroupInfoModal } from './components/Group/GroupInfoModal';
import { useAuth } from './hooks/useAuth';
import { useGroups } from './hooks/useGroups';
import { useChat } from './hooks/useChat';

const DARK_KEY = 'smallchat-dark';
const FONT_KEY = 'smallchat-fontsize';
const GROUP_KEY = 'smallchat-current-group';

type AuthMode = 'login' | 'register';

export default function App() {
  const { user, isLoading, isAuthenticated, login, register, logout, updateProfile } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => localStorage.getItem(DARK_KEY) === '1');
  const [fontSize, setFontSize] = useState<number>(() => {
    const v = parseInt(localStorage.getItem(FONT_KEY) || '16', 10);
    return Number.isFinite(v) ? Math.min(24, Math.max(14, v)) : 16;
  });
  const [currentGroupId, setCurrentGroupId] = useState<number | null>(() => {
    const v = parseInt(localStorage.getItem(GROUP_KEY) || '', 10);
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarVisible(!mobile);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem(DARK_KEY, isDarkMode ? '1' : '0');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    if (currentGroupId) localStorage.setItem(GROUP_KEY, String(currentGroupId));
    else localStorage.removeItem(GROUP_KEY);
  }, [currentGroupId]);

  const { groups, loading: groupsLoading, create, refresh: refreshGroups } = useGroups();
  const currentGroup = useMemo(
    () => groups.find((g) => g.id === currentGroupId) || null,
    [groups, currentGroupId],
  );

  const {
    messages,
    loading: msgLoading,
    loadingMore,
    hasMore,
    sending,
    uploadProgress,
    loadMore,
    sendText,
    sendFileMessage,
    deleteMessage,
  } = useChat(isAuthenticated ? currentGroupId : null, user);

  // 群列表刷新后，若当前群已不存在（被解散/退群），切到 null
  useEffect(() => {
    if (!groupsLoading && currentGroupId && !groups.some((g) => g.id === currentGroupId)) {
      setCurrentGroupId(null);
    }
  }, [groups, groupsLoading, currentGroupId]);

  // 启动屏
  if (isLoading) {
    return (
      <div className="min-h-app flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="flex flex-col items-center text-gray-400">
          <Hash className="w-10 h-10 text-green-500 mb-3" />
          <p className="text-sm">smallChat</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return authMode === 'login' ? (
      <Login onLogin={login} onSwitchToRegister={() => setAuthMode('register')} />
    ) : (
      <Register onRegister={register} onSwitchToLogin={() => setAuthMode('login')} />
    );
  }

  const selectGroup = (id: number) => {
    setCurrentGroupId(id);
    if (isMobile) setSidebarVisible(false);
  };

  const handleCreateGroup = async (name: string) => {
    const id = await create(name);
    setCurrentGroupId(id);
  };

  return (
    <div className={`flex h-app overflow-hidden ${isDarkMode ? 'dark bg-gray-900' : 'bg-gray-100'}`}>
      {/* 侧边栏：桌面常驻 / 移动抽屉 */}
      {(sidebarVisible || !isMobile) && (
        <div
          className={`fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-300 lg:translate-x-0 ${
            sidebarVisible ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar
            user={user}
            groups={groups}
            currentGroupId={currentGroupId}
            onSelectGroup={selectGroup}
            onCreateGroup={() => setShowCreateGroup(true)}
            onOpenSettings={() => {
              setShowSettings(true);
              if (isMobile) setSidebarVisible(false);
            }}
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          />
        </div>
      )}

      {sidebarVisible && isMobile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarVisible(false)}
        />
      )}

      {/* 主区域 */}
      <div className="flex-1 flex flex-col min-w-0 w-full lg:w-auto">
        {currentGroup ? (
          <>
            {/* 群头部 */}
            <div
              className={`border-b px-2 sm:px-4 py-2.5 flex items-center justify-between flex-shrink-0 ${
                isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center space-x-2 min-w-0">
                <button
                  onClick={() => setSidebarVisible(!sidebarVisible)}
                  className={`p-1.5 rounded-lg lg:hidden flex-shrink-0 ${
                    isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {sidebarVisible ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
                <div className="min-w-0">
                  <h2 className={`text-base font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                    {currentGroup.name}
                  </h2>
                  <p className="text-xs text-gray-400">{currentGroup.member_count} 位成员</p>
                </div>
              </div>
              <button
                onClick={() => setShowGroupInfo(true)}
                className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-600 hover:bg-green-50'
                }`}
                title="群聊信息"
              >
                <Info className="w-5 h-5" />
              </button>
            </div>

            <MessageList
              messages={messages}
              currentUserId={user.id}
              ownerId={currentGroup.owner_id}
              loading={msgLoading}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onDeleteMessage={deleteMessage}
              isDarkMode={isDarkMode}
              fontSize={fontSize}
              groupName={currentGroup.name}
            />
            <InputBox
              onSendText={sendText}
              onSendFile={sendFileMessage}
              sending={sending}
              uploadProgress={uploadProgress}
              isDarkMode={isDarkMode}
              fontSize={fontSize}
            />
          </>
        ) : (
          // 未选择群的空态
          <div className={`flex-1 flex flex-col items-center justify-center ${isDarkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
            <button
              onClick={() => (isMobile ? setSidebarVisible(true) : setShowCreateGroup(true))}
              className="flex flex-col items-center"
            >
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${isDarkMode ? 'bg-gray-700' : 'bg-green-100'}`}>
                <Hash className={`w-10 h-10 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <p className={`text-base font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {groups.length === 0 ? '创建你的第一个群聊' : '从左侧选择一个群聊'}
              </p>
              <p className="text-sm mt-1 text-gray-400">
                {groups.length === 0 ? '把不同类别的事情，分别放进不同的群' : '或新建一个群聊开始记录'}
              </p>
            </button>
          </div>
        )}
      </div>

      {/* 弹窗 */}
      {showCreateGroup && (
        <CreateGroupModal
          onCreate={handleCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          isDarkMode={isDarkMode}
        />
      )}

      {showGroupInfo && currentGroup && (
        <GroupInfoModal
          group={currentGroup}
          currentUserId={user.id}
          onGroupChanged={refreshGroups}
          onGroupDeleted={() => setCurrentGroupId(null)}
          onClose={() => setShowGroupInfo(false)}
          isDarkMode={isDarkMode}
        />
      )}

      {showSettings && (
        <ProfileSettings
          user={user}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          onUpdate={updateProfile}
          onLogout={logout}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
