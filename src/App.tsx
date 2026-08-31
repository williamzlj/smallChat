import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './i18n';
import { Sidebar } from './components/Sidebar';
import { MessageList } from './components/MessageList';
import { InputBox } from './components/InputBox';
import { ChatHistory } from './components/ChatHistory';
import { MessageFlow, MessageFlowItem } from './components/MessageFlow';
import { TodoList } from './components/Todo/TodoList';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ProfileSettings } from './components/Auth/ProfileSettings';
import { AdminPanel } from './components/Admin/AdminPanel';
import { LanguageSelector } from './components/LanguageSelector';
import { useChat } from './hooks/useChat';
import { useAuth } from './hooks/useAuth';
import { useTodo } from './hooks/useTodo';
import { ChatHistory as ChatHistoryType } from './types';
import { ArrowLeft, Check, Download, FileText, Shield, Trash2, ListChecks, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Menu, X, Copy, Globe } from 'lucide-react';
import { exportDatabase, importDatabase } from './db/indexedDB';

type AuthMode = 'login' | 'register';

export default function App() {
  const { t } = useTranslation();

  // 动态更新网页标题
  useEffect(() => {
    document.title = t('appTitle');
  }, [t, i18n.language]);
  const [activeTab, setActiveTab] = useState<'chat' | 'history' | 'todo' | 'messageFlow'>('chat');
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [sourceTab, setSourceTab] = useState<'history' | 'messageFlow' | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [safeAreaBottom, setSafeAreaBottom] = useState(0);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [showSelectMode, setShowSelectMode] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [adminError, setAdminError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [showScrollTopButton, setShowScrollTopButton] = useState(false);
  const [showScrollBottomButton, setShowScrollBottomButton] = useState(false);
  const [currentChatTitle, setCurrentChatTitle] = useState('');

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarVisible(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { user, isAuthenticated, login, register, logout, updateProfile, botSettings, updateBotSettings } = useAuth();

  const {
    messages,
    chatHistory,
    isTyping,
    sendMessage,
    loadChat,
    deleteChat,
    deleteMessage,
    deleteMessageInChat,
    deleteAllMessages,
    clearMessages,
    updateChatTitle,
    updateChatNote,
    togglePinChat,
    searchChats,
    getChatsByDateRange,
    exportChatToWord,
    exportChatsToWord,
    formatTimestamp,
    currentChatId,
  } = useChat(user?.id || null, botSettings.defaultReply);

  // 留言流水：所有用户留言按时间倒序
  const messageFlowItems = useMemo<MessageFlowItem[]>(() => {
    const items: MessageFlowItem[] = [];
    chatHistory.forEach(chat => {
      chat.messages.forEach(msg => {
        if (msg.sender === 'user') {
          items.push({
            chatId: chat.id,
            chatTitle: chat.title,
            messageId: msg.id,
            content: msg.content,
            timestamp: msg.timestamp,
            image: msg.image,
          });
        }
      });
    });
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [chatHistory]);

  // 排序后的聊天列表（与聊天记录界面排序一致：置顶优先，再按时间倒序）
  const sortedChatHistory = useMemo(() => {
    return [...chatHistory].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [chatHistory]);

  // 当前聊天在排序列表中的位置，用于上一个/下一个导航
  const currentChatIndex = sortedChatHistory.findIndex(c => c.id === currentChatId.current);
  const hasPrevChat = currentChatIndex > 0;
  const hasNextChat = currentChatIndex >= 0 && currentChatIndex < sortedChatHistory.length - 1;

  const handlePrevChat = () => {
    if (hasPrevChat) {
      handleLoadChat(sortedChatHistory[currentChatIndex - 1], sourceTab || 'history');
    }
  };

  const handleNextChat = () => {
    if (hasNextChat) {
      handleLoadChat(sortedChatHistory[currentChatIndex + 1], sourceTab || 'history');
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const chatContainer = document.querySelector('.chat-container');
      if (chatContainer) {
        const { scrollTop, scrollHeight, clientHeight } = chatContainer;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        const isAtTop = scrollTop < 50;
        
        setShowScrollTopButton(!isAtTop && messages.length > 0);
        setShowScrollBottomButton(!isAtBottom && messages.length > 0);
      }
    };

    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
      chatContainer.addEventListener('scroll', handleScroll);
      return () => chatContainer.removeEventListener('scroll', handleScroll);
    }
  }, [messages.length]);

  useEffect(() => {
    const getSafeAreaHeight = () => {
      let bottom = 0;
      if (typeof window !== 'undefined' && window.visualViewport) {
        bottom = window.innerHeight - window.visualViewport.height;
      } else if (typeof window !== 'undefined') {
        const envBottom = parseInt(window.getComputedStyle(document.body).getPropertyValue('--safe-area-bottom') || '0');
        if (!isNaN(envBottom)) {
          bottom = envBottom;
        }
      }
      setSafeAreaBottom(Math.max(bottom, 0));
    };

    getSafeAreaHeight();
    
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', getSafeAreaHeight);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', getSafeAreaHeight);
        window.visualViewport.addEventListener('scroll', getSafeAreaHeight);
      }
      
      return () => {
        window.removeEventListener('resize', getSafeAreaHeight);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', getSafeAreaHeight);
          window.visualViewport.removeEventListener('scroll', getSafeAreaHeight);
        }
      };
    }
  }, []);

  const {
    pendingTodos,
    completedTodos,
    referenceTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    setStatus,
    togglePin,
    createFromMessage,
    copyToPending,
  } = useTodo(user?.id || null);

  useEffect(() => {
    if (showSavedToast) {
      const timer = setTimeout(() => setShowSavedToast(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showSavedToast]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (messages.length > 0) {
        e.preventDefault();
        e.returnValue = '您有未保存的聊天记录，确定要离开吗？';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [messages]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleNewChat = () => {
    clearMessages();
    setActiveTab('chat');
    setSourceTab(null);
    if (isMobile) {
      setSidebarVisible(false);
    }
  };

  const handleLoadChat = (chat: ChatHistoryType, from: 'history' | 'messageFlow' = 'history') => {
    loadChat(chat);
    setActiveTab('chat');
    setSourceTab(from);
    setShowSearchResults(false);
    setCurrentChatTitle(chat.title);
    if (isMobile) {
      setSidebarVisible(false);
    }
  };

  const handleExportChat = (chat: ChatHistoryType) => {
    const content = exportChatToWord(chat);
    const username = user?.username || 'user';
    downloadFile(content, `sudong_${username}_${chat.title}_${getExportDate()}.txt`, 'text/plain');
  };

  const handleExportAll = () => {
    const username = user?.username || 'user';
    let chatsToExport = chatHistory;
    
    if (exportStartDate || exportEndDate) {
      const start = exportStartDate ? new Date(exportStartDate) : new Date(0);
      const end = exportEndDate ? new Date(exportEndDate) : new Date();
      chatsToExport = getChatsByDateRange(start, end);
    }

    if (chatsToExport.length === 0) {
      alert('没有找到匹配的聊天记录');
      return;
    }

    const content = exportChatsToWord(chatsToExport);
    const filename = exportStartDate || exportEndDate 
      ? `sudong_${username}_聊天记录_${exportStartDate || '最早'}_${exportEndDate || '最晚'}_${getExportDate()}.txt`
      : `sudong_${username}_聊天记录汇总_${getExportDate()}.txt`;
    downloadFile(content, filename, 'text/plain');
    setShowExportModal(false);
    setExportStartDate('');
    setExportEndDate('');
  };

  const handleExportDatabase = async () => {
    try {
      const username = user?.username || 'user';
      const data = await exportDatabase(user?.id || null);
      downloadFile(data, `sudong_${username}_data_${getExportDate()}.json`, 'application/json');
      setShowExportModal(false);
    } catch (error) {
      console.error('Failed to export database:', error);
      alert('导出失败');
    }
  };

  const handleClearChatHistory = async () => {
    if (!confirm(t('clearChatHistoryConfirm'))) {
      return;
    }

    try {
      const username = user?.username || 'user';
      const data = await exportDatabase(user?.id || null);
      downloadFile(data, `sudong_${username}_backup_before_clear_${getExportDate()}.json`, 'application/json');
      
      setTimeout(async () => {
        try {
          for (const chat of chatHistory) {
            await deleteChat(chat.id);
          }
          clearMessages();
          alert(t('chatHistoryCleared'));
        } catch (error) {
          console.error('Failed to clear chat history:', error);
          alert(t('clearFailed'));
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to backup before clearing:', error);
      if (confirm(t('backupFailedConfirmClear'))) {
        try {
          for (const chat of chatHistory) {
            await deleteChat(chat.id);
          }
          clearMessages();
          alert(t('chatHistoryClearedNoBackup'));
        } catch (error) {
          console.error('Failed to clear chat history:', error);
          alert(t('clearFailed'));
        }
      }
    }
  };

  const handleImportDatabase = async (file: File) => {
    try {
      const text = await file.text();
      await importDatabase(text);
      alert('导入成功，请刷新页面');
      setShowImportModal(false);
    } catch (error) {
      console.error('Failed to import database:', error);
      alert('导入失败');
    }
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'admin123') {
      setShowAdminPanel(true);
      setAdminPassword('');
      setAdminError('');
    } else {
      setAdminError('密码错误');
    }
  };

  const getExportDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    const results = searchChats(query);
    setSearchResults(results);
    setShowSearchResults(results.length > 0);
  };

  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);

  const handleLoadFromSearch = (chatId: string, messageId?: string, from: 'history' | 'messageFlow' = 'history') => {
    const chat = chatHistory.find(c => c.id === chatId);
    if (chat) {
      handleLoadChat(chat, from);
      setHighlightMessageId(messageId || null);
      setTimeout(() => {
        setHighlightMessageId(null);
      }, 3000);
      setShowSearchResults(false);
    }
  };

  const highlightKeyword = (text: string, keyword: string) => {
    if (!keyword.trim()) return text;
    const regex = new RegExp(`(${keyword})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) => {
      if (part.toLowerCase() === keyword.toLowerCase()) {
        return <mark key={index} className="bg-red-400 text-white px-0.5 rounded">{part}</mark>;
      }
      return part;
    });
  };

  const handleConvertToTodo = (content: string) => {
    createFromMessage(content);
    setActiveTab('todo');
  };

  const toggleSelectMessage = (messageId: string) => {
    setSelectedMessages(prev => {
      if (prev.includes(messageId)) {
        return prev.filter(id => id !== messageId);
      } else {
        return [...prev, messageId];
      }
    });
  };

  const handleDeleteSelected = () => {
    if (selectedMessages.length === 0) return;
    if (selectedMessages.length === messages.length) {
      const chatId = currentChatId.current;
      const chatTitle = chatHistory.find(c => c.id === chatId)?.title || '该聊天主题';
      if (confirm(`确定要删除${chatTitle}及下面的 ${selectedMessages.length} 条消息吗？`)) {
        if (chatId) {
          deleteChat(chatId);
        }
        setSelectedMessages([]);
        setShowSelectMode(false);
        setActiveTab(sourceTab || 'history');
        setSourceTab(null);
        clearMessages();
      }
    } else {
      if (confirm(`确定要删除选中的 ${selectedMessages.length} 条消息吗？`)) {
        selectedMessages.forEach(id => deleteMessage(id));
        setSelectedMessages([]);
        setShowSelectMode(false);
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedMessages.length === messages.length) {
      setSelectedMessages([]);
    } else {
      setSelectedMessages(messages.map(m => m.id));
    }
  };

  const handleCopySelected = async () => {
    if (selectedMessages.length === 0) return;
    
    const selectedMsgs = messages.filter(m => selectedMessages.includes(m.id));
    const sortedMsgs = [...selectedMsgs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp));
    
    let copyText = '';
    sortedMsgs.forEach(msg => {
      const timestamp = formatTimestamp(msg.timestamp);
      const sender = msg.sender === 'user' ? (user?.username || '用户') : botSettings.name;
      copyText += `${sender} [${timestamp}]\n${msg.content}\n\n`;
    });
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(copyText);
        alert(`已复制 ${selectedMessages.length} 条消息到剪贴板`);
      } else {
        fallbackCopyToClipboard(copyText);
      }
    } catch (err) {
      console.error('复制失败:', err);
      fallbackCopyToClipboard(copyText);
    }
  };

  const fallbackCopyToClipboard = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        alert(`已复制 ${selectedMessages.length} 条消息到剪贴板`);
      } else {
        alert('复制失败，请手动复制以下内容：\n\n' + text);
      }
    } catch (err) {
      console.error('Fallback复制失败:', err);
      alert('复制失败，请手动复制以下内容：\n\n' + text);
    }
    
    document.body.removeChild(textArea);
  };

  if (!isAuthenticated) {
    return authMode === 'login' ? (
      <Login
        onLogin={login}
        onSwitchToRegister={() => setAuthMode('register')}
      />
    ) : (
      <Register
        onRegister={register}
        onSwitchToLogin={() => setAuthMode('login')}
      />
    );
  }

  return (
    <div className={`flex h-screen transition-colors duration-300 overflow-hidden`}>
      {/* Sidebar with toggle - hidden by default on mobile */}
      {(sidebarVisible || !isMobile) && (
        <div className={`fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarVisible ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className={`w-64 lg:w-64 h-full ${isDarkMode ? 'bg-gray-800' : 'bg-white'} border-r border-gray-700 lg:border-gray-200`}>
            <Sidebar
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setShowSearchResults(false);
                if (isMobile) {
                  setSidebarVisible(false);
                }
              }}
              onNewChat={handleNewChat}
              onOpenSettings={() => {
                setShowProfileSettings(true);
                if (isMobile) {
                  setSidebarVisible(false);
                }
              }}
              onOpenAdmin={() => {
                const password = prompt(t('enterAdminPassword'));
                if (password === 'admin123') {
                  setShowAdminPanel(true);
                } else if (password !== null) {
                  alert(t('wrongPassword'));
                }
              }}
              user={user!}
              botSettings={botSettings}
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            />
          </div>
        </div>
      )}

      {/* Overlay for mobile sidebar */}
      {sidebarVisible && isMobile && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarVisible(false)}
        />
      )}

      <div className={`flex-1 flex flex-col ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'} min-w-0 lg:static fixed inset-y-0 right-0 z-10 w-full lg:w-auto`} style={{ paddingBottom: isMobile ? `${safeAreaBottom}px` : '0' }}>
        {activeTab === 'chat' ? (
          <>
            <div className={`border-b px-2 sm:px-4 py-2 sm:py-3 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  {/* Toggle sidebar button - always visible on mobile */}
                  <button
                    onClick={() => setSidebarVisible(!sidebarVisible)}
                    className={`p-1 rounded-lg transition-colors ${
                      isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-500 hover:bg-green-50'
                    }`}
                  >
                    {sidebarVisible ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                  
                  {sourceTab && (
                    <button
                      onClick={() => {
                        setActiveTab(sourceTab);
                        setSourceTab(null);
                        clearMessages();
                      }}
                      className={`p-1 rounded-lg transition-colors ${
                        isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-500 hover:bg-green-50'
                      }`}
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                  )}
                  {sourceTab && sortedChatHistory.length > 1 && (
                    <div className="flex items-center">
                      <button
                        onClick={handlePrevChat}
                        disabled={!hasPrevChat}
                        title={t('previousChat')}
                        className={`p-1 rounded-lg transition-colors ${
                          !hasPrevChat
                            ? (isDarkMode ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
                            : (isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-500 hover:bg-green-50')
                        }`}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleNextChat}
                        disabled={!hasNextChat}
                        title={t('nextChat')}
                        className={`p-1 rounded-lg transition-colors ${
                          !hasNextChat
                            ? (isDarkMode ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
                            : (isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-500 hover:bg-green-50')
                        }`}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2 overflow-hidden">
                      <h2 className={`font-medium text-sm sm:text-base ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                        {sourceTab ? t('loadedRecords') : t('chatWithBot', { name: botSettings.name })}
                      </h2>
                      {sourceTab && currentChatTitle && (
                        <span className={`text-xs sm:text-sm truncate px-2 py-0.5 rounded ${
                          isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {currentChatTitle}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">
                      {sourceTab ? t('clickToBack') : botSettings.chatHint || t('yourSecretSafe')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {showSavedToast && (
                    <div className="flex items-center space-x-2 bg-green-500 text-white px-2 sm:px-3 py-1 rounded-full">
                      <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="text-xs font-medium">自动保存成功</span>
                    </div>
                  )}
                  {showSelectMode ? (
                    <div className="flex items-center space-x-3 sm:space-x-3">
                      <button
                        onClick={handleSelectAll}
                        className={`flex items-center space-x-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                          isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                        } text-white min-w-[60px] sm:min-w-[70px]`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMessages.length === messages.length && messages.length > 0}
                          onChange={handleSelectAll}
                          className="w-3 h-3 sm:w-4 sm:h-4 cursor-pointer"
                        />
                        <span className="hidden sm:inline">{t('selectAll')}</span>
                      </button>
                      <button
                        onClick={handleCopySelected}
                        disabled={selectedMessages.length === 0}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                          selectedMessages.length > 0
                            ? isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
                            : 'bg-gray-400 cursor-not-allowed'
                        } text-white min-w-[60px] sm:min-w-[75px] justify-center`}
                      >
                        <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">{t('copy')}</span>
                      </button>
                      <button
                        onClick={handleDeleteSelected}
                        disabled={selectedMessages.length === 0}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                          selectedMessages.length > 0
                            ? isDarkMode ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'
                            : 'bg-gray-400 cursor-not-allowed'
                        } text-white min-w-[60px] sm:min-w-[75px] justify-center`}
                      >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>{selectedMessages.length}</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowSelectMode(false);
                          setSelectedMessages([]);
                        }}
                        className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors ${
                          isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                        } text-white min-w-[60px] sm:min-w-[70px]`}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  ) : (
                    messages.length > 0 && (
                      <>
                        {showScrollTopButton && (
                          <button
                            onClick={() => {
                              const chatContainer = document.querySelector('.chat-container');
                              if (chatContainer) {
                                chatContainer.scrollTo({ top: 0, behavior: 'smooth' });
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDarkMode ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'
                            } ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
                            title="跳转到顶部"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                        )}
                        {showScrollBottomButton && (
                          <button
                            onClick={() => {
                              const chatContainer = document.querySelector('.chat-container');
                              if (chatContainer) {
                                chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
                              }
                            }}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isDarkMode ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'
                            } ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
                            title="跳转到底部"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setShowSelectMode(true)}
                          className={`flex items-center space-x-1 px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm transition-colors ${
                            isDarkMode ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'
                          } ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
                        >
                          <ListChecks className="w-4 h-4" />
                          <span className="hidden sm:inline">多选</span>
                        </button>
                        
                      </>
                    )
                  )}
                </div>
              </div>
            </div>
            <MessageList 
              messages={messages} 
              isTyping={isTyping}
              onDeleteMessage={deleteMessage}
              isDarkMode={isDarkMode}
              botName={botSettings.name}
              botAvatar={botSettings.avatar}
              userName={user?.username || ''}
              userAvatar={user?.avatar || ''}
              userNameColor={user?.userNameColor || 'text-blue-500'}
              chatBackgroundText={botSettings.chatBackgroundText}
              fontSize={botSettings.fontSize}
              formatTimestamp={formatTimestamp}
              onConvertToTodo={handleConvertToTodo}
              highlightMessageId={highlightMessageId}
              selectedMessages={selectedMessages}
              onToggleSelect={toggleSelectMessage}
              showSelect={showSelectMode}
            />
            <InputBox
              onSend={sendMessage}
              onSave={() => {}}
              hasMessages={false}
              isDarkMode={isDarkMode}
              isBanned={user?.isBanned || false}
              onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
              fontSize={botSettings.fontSize}
            />
          </>
        ) : activeTab === 'history' ? (
          <div className="flex flex-col h-full">
            <div className={`border-b px-2 sm:px-4 py-2 sm:py-3 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <button
                    onClick={() => setSidebarVisible(!sidebarVisible)}
                    className={`p-1 rounded-lg transition-colors ${
                      isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-500 hover:bg-green-50'
                    }`}
                  >
                    {sidebarVisible ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                  <div>
                    <h2 className={`font-medium text-sm sm:text-base ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{t('history')}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{t('totalRecords')} {chatHistory.length} {t('records')}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className={`flex items-center space-x-1 sm:space-x-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
                    } text-white`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>{t('import')}</span>
                  </button>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className={`flex items-center space-x-1 sm:space-x-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      isDarkMode ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'
                    } text-white`}
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('export')}</span>
                  </button>
                  <button
                    onClick={handleClearChatHistory}
                    className={`flex items-center space-x-1 sm:space-x-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      isDarkMode ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'
                    } text-white`}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t('clear')}</span>
                  </button>
                </div>
              </div>
            </div>

            {showSearchResults ? (
              <div className={`flex-1 overflow-y-auto p-3 sm:p-4 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <div className="mb-3 sm:mb-4 flex items-center justify-between">
                  <h3 className={`text-xs sm:text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('searchResults')} ({searchResults.length})
                  </h3>
                  <button
                    onClick={() => {
                      setShowSearchResults(false);
                      setSearchQuery('');
                    }}
                    className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs sm:text-sm transition-colors ${
                      isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">{t('goBack')}</span>
                  </button>
                </div>
                  {searchResults.map((result, index) => (
                    <div
                      key={`${result.chatId}-${result.messageId}-${index}`}
                      className={`mb-3 p-3 rounded-lg border ${
                        isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-green-500">{result.chatTitle}</span>
                        <span className="text-xs text-gray-400">
                          {formatTimestamp(result.timestamp)}
                        </span>
                      </div>
                      <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {highlightKeyword(result.preview, searchQuery)}
                      </p>
                      <button
                        onClick={() => handleLoadFromSearch(result.chatId, result.messageId)}
                        className="mt-2 text-xs text-green-500 hover:text-green-600"
                      >
                        {t('locateMessage')}
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <ChatHistory
                  history={chatHistory}
                  onLoad={handleLoadChat}
                  onDelete={deleteChat}
                  onUpdateTitle={updateChatTitle}
                  onUpdateNote={updateChatNote}
                  onTogglePin={togglePinChat}
                  onExport={handleExportChat}
                  onSearch={handleSearch}
                  isDarkMode={isDarkMode}
                  formatTimestamp={formatTimestamp}
                />
              </div>
            )}
          </div>
        ) : activeTab === 'messageFlow' ? (
          <div className="flex flex-col h-full">
            <div className={`border-b px-2 sm:px-4 py-2 sm:py-3 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <button
                    onClick={() => setSidebarVisible(!sidebarVisible)}
                    className={`p-1 rounded-lg transition-colors ${
                      isDarkMode ? 'text-gray-400 hover:text-green-400 hover:bg-gray-700' : 'text-gray-500 hover:text-green-500 hover:bg-green-50'
                    }`}
                  >
                    {sidebarVisible ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                  <div>
                    <h2 className={`font-medium text-sm sm:text-base ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{t('messageFlow')}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{t('totalRecords')} {messageFlowItems.length} {t('records')}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className={`flex items-center space-x-1 sm:space-x-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
                    } text-white`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>{t('import')}</span>
                  </button>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className={`flex items-center space-x-1 sm:space-x-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      isDarkMode ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'
                    } text-white`}
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('export')}</span>
                  </button>
                  <button
                    onClick={handleClearChatHistory}
                    className={`flex items-center space-x-1 sm:space-x-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      isDarkMode ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'
                    } text-white`}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t('clear')}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <MessageFlow
                items={messageFlowItems}
                onLocate={(chatId, messageId) => handleLoadFromSearch(chatId, messageId, 'messageFlow')}
                onDelete={deleteMessageInChat}
                isDarkMode={isDarkMode}
                formatTimestamp={formatTimestamp}
              />
            </div>
          </div>
        ) : (
          <TodoList
            pendingTodos={pendingTodos}
            completedTodos={completedTodos}
            referenceTodos={referenceTodos}
            onAdd={addTodo}
            onSetStatus={setStatus}
            onDelete={deleteTodo}
            onUpdate={updateTodo}
            onTogglePin={togglePin}
            onCopyToPending={copyToPending}
            sidebarVisible={sidebarVisible}
            onToggleSidebar={() => setSidebarVisible(!sidebarVisible)}
            isDarkMode={isDarkMode}
            isMobile={isMobile}
            currentLang={i18n.language}
          />
        )}
      </div>

      {showProfileSettings && user && (
        <ProfileSettings
          user={user}
          botSettings={botSettings}
          onUpdate={updateProfile}
          onUpdateBot={updateBotSettings}
          onLogout={logout}
          onClose={() => setShowProfileSettings(false)}
        />
      )}

      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl shadow-xl w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <h3 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{t('exportData')}</h3>
              <p className="text-xs text-gray-500 mt-1">{t('selectExportMethod')}</p>
            </div>
            <div className="p-4 space-y-4">
              <button
                className={`w-full flex items-center justify-center space-x-3 p-4 rounded-xl border-2 transition-colors ${
                  isDarkMode ? 'border-gray-600 hover:border-green-500' : 'border-gray-200 hover:border-green-500'
                }`}
                onClick={() => handleExportAll()}
              >
                <Download className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                <div className="text-left">
                  <p className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t('exportChatTitle')}</p>
                  <p className="text-xs text-gray-500">{t('exportAsText')}</p>
                </div>
              </button>
              
              <button
                className={`w-full flex items-center justify-center space-x-3 p-4 rounded-xl border-2 transition-colors ${
                  isDarkMode ? 'border-gray-600 hover:border-green-500' : 'border-gray-200 hover:border-green-500'
                }`}
                onClick={handleExportDatabase}
              >
                <FileText className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                <div className="text-left">
                  <p className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{t('exportDatabaseTitle')}</p>
                  <p className="text-xs text-gray-500">{t('containsAllData')}</p>
                </div>
              </button>
            </div>
            <div className={`p-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <button
                onClick={() => setShowExportModal(false)}
                className={`w-full px-4 py-2 rounded-lg transition-colors ${
                  isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl shadow-xl w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <h3 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{t('importTitle')}</h3>
              <p className="text-xs text-gray-500 mt-1">{t('selectFile')}</p>
            </div>
            <div className="p-4 space-y-4">
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImportDatabase(file);
                  }
                }}
                className={`w-full p-4 border-2 border-dashed rounded-xl ${
                  isDarkMode ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-600'
                }`}
              />
              <p className="text-xs text-gray-500 text-center">
                {t('jsonFormat')}
              </p>
            </div>
            <div className={`p-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <button
                onClick={() => setShowImportModal(false)}
                className={`w-full px-4 py-2 rounded-lg transition-colors ${
                  isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdminPanel && (
        <AdminPanel
          onClose={() => setShowAdminPanel(false)}
        />
      )}

    </div>
  );
}
