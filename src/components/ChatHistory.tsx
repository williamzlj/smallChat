import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatHistory as ChatHistoryType } from '../types';
import { Clock, Trash2, FolderOpen, Search, X, Edit2, FileText, Download, Calendar, Pin, CheckSquare } from 'lucide-react';

interface ChatHistoryProps {
  history: ChatHistoryType[];
  onLoad: (chat: ChatHistoryType) => void;
  onDelete: (chatId: string) => void;
  onUpdateTitle: (chatId: string, title: string) => void;
  onUpdateNote: (chatId: string, note: string) => void;
  onTogglePin: (chatId: string) => void;
  onExport: (chat: ChatHistoryType) => void;
  onSearch?: (query: string) => void;
  isDarkMode?: boolean;
  formatTimestamp: (date: Date) => string;
}

export const ChatHistory = ({ history, onLoad, onDelete, onUpdateTitle, onUpdateNote, onTogglePin, onExport, onSearch, isDarkMode = false, formatTimestamp }: ChatHistoryProps) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showNoteModal, setShowNoteModal] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const itemsPerPage = 20;

  const highlightKeyword = (text: string, keyword: string) => {
    if (!keyword.trim()) return text;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) => {
      if (part.toLowerCase() === keyword.toLowerCase()) {
        return <mark key={index} className="bg-yellow-300 text-gray-900 px-0.5 rounded">{part}</mark>;
      }
      return part;
    });
  };

  const filteredHistory = history.filter(chat => {
    const chatDate = new Date(chat.createdAt);
    
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (chatDate < start) return false;
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (chatDate > end) return false;
    }
    
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      chat.title.toLowerCase().includes(query) ||
      chat.messages.some(msg => msg.content.toLowerCase().includes(query)) ||
      (chat.note && chat.note.toLowerCase().includes(query))
    );
  }).sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageData = filteredHistory.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleDateChange = () => {
    setCurrentPage(1);
  };

  const handleSelectAll = () => {
    if (selectedChatIds.length === currentPageData.length) {
      setSelectedChatIds([]);
    } else {
      setSelectedChatIds(currentPageData.map(chat => chat.id));
    }
  };

  const handleSelectChat = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedChatIds(prev => 
      prev.includes(chatId) 
        ? prev.filter(id => id !== chatId)
        : [...prev, chatId]
    );
  };

  const handleBatchDelete = () => {
    const selectedChats = currentPageData.filter(chat => selectedChatIds.includes(chat.id));
    if (selectedChats.length === 0) return;

    const totalMessages = selectedChats.reduce((sum, chat) => sum + chat.messages.length, 0);
    if (confirm(`${t('confirmDeleteSelected')} ${selectedChats.length} ${t('chatTitle')}${t('deleteChatTopicAndMessages')} ${totalMessages} ${t('messages')}${t('deleteSelectedMessages')}`)) {
      selectedChatIds.forEach(chatId => {
        onDelete(chatId);
      });
      setSelectedChatIds([]);
    }
  };

  const handleSaveTitle = (chatId: string) => {
    if (editingTitle.trim()) {
      onUpdateTitle(chatId, editingTitle.trim());
    }
    setEditingChatId(null);
    setEditingTitle('');
  };

  const handleSaveNote = () => {
    if (showNoteModal) {
      onUpdateNote(showNoteModal, noteContent);
    }
    setShowNoteModal(null);
    setNoteContent('');
  };

  const handleDelete = (chatId: string) => {
    onDelete(chatId);
    setConfirmDelete(null);
  };

  if (history.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <FolderOpen className="w-8 h-8" />
        </div>
        <p className="text-sm">{t('noChatsFound')}</p>
        <p className="text-xs mt-1">{t('chatHistory')}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col safe-area-bottom">
      <div className={`p-3 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  onSearch?.(searchQuery);
                }
              }}
              placeholder={t('searchPlaceholder')}
              className={`w-full pl-10 pr-10 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 transition-all ${
                isDarkMode ? 'bg-gray-700 text-white placeholder-gray-500' : 'bg-gray-200 placeholder-gray-500 border border-gray-300'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setCurrentPage(1);
                  onSearch?.('');
                }}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 transition-colors ${
                  isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => onSearch?.(searchQuery)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isDarkMode 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {t('search')}
          </button>
        </div>
        
        <div className="flex items-center space-x-2 mt-3 gap-2 flex-wrap">
          <button
            onClick={handleSelectAll}
            title={t('selectAll')}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedChatIds.length === currentPageData.length && currentPageData.length > 0
                ? (isDarkMode ? 'bg-green-900 text-green-400 hover:bg-green-800' : 'bg-green-100 text-green-600 hover:bg-green-200')
                : (isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200')
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>{t('selectAll')}</span>
          </button>
          <Calendar className={`w-4 h-4 hidden sm:block ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          <div className="relative flex-shrink-0" style={{ width: '130px', minWidth: '130px', maxWidth: '170px', height: '40px' }}>
            <input
              type="date"
              lang="zh-CN"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                handleDateChange();
              }}
              className={`w-full px-3 py-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 transition-all ${
                isDarkMode ? 'bg-gray-700 border border-gray-600 text-white' : 'bg-gray-100 border border-gray-300'
              } ${!startDate ? 'text-transparent date-placeholder-hidden' : ''}`}
              style={{ 
                boxSizing: 'border-box', 
                appearance: 'none', 
                WebkitAppearance: 'none', 
                minHeight: '40px',
                lineHeight: '1.5',
                fontSize: '14px',
                WebkitBoxSizing: 'border-box'
              }}
            />
            {!startDate && (
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none ${
                isDarkMode ? 'text-gray-500' : 'text-gray-400'
              }`}>
                YYYY/MM/DD
              </span>
            )}
          </div>
          <span className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} inline-flex items-center h-full px-2`}>~</span>
          <div className="relative flex-shrink-0" style={{ width: '130px', minWidth: '130px', maxWidth: '170px', height: '40px' }}>
            <input
              type="date"
              lang="zh-CN"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                handleDateChange();
              }}
              className={`w-full px-3 py-3 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 transition-all ${
                isDarkMode ? 'bg-gray-700 border border-gray-600 text-white' : 'bg-gray-100 border border-gray-300'
              } ${!endDate ? 'text-transparent date-placeholder-hidden' : ''}`}
              style={{ 
                boxSizing: 'border-box', 
                appearance: 'none', 
                WebkitAppearance: 'none', 
                minHeight: '40px',
                lineHeight: '1.5',
                fontSize: '14px',
                WebkitBoxSizing: 'border-box'
              }}
            />
            {!endDate && (
              <span className={`absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 text-xs sm:text-sm pointer-events-none ${
                isDarkMode ? 'text-gray-500' : 'text-gray-400'
              }`}>
                YYYY/MM/DD
              </span>
            )}
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setCurrentPage(1);
              }}
              className={`px-2 py-2 rounded-lg transition-colors ${
                isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {selectedChatIds.length > 0 && (
            <div className="flex items-center space-x-2 ml-auto">
              <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {t('selected')} {selectedChatIds.length} {t('records')}
              </span>
              <button
                onClick={() => setSelectedChatIds([])}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  isDarkMode ? 'bg-gray-600 hover:bg-gray-500 text-gray-300' : 'bg-white hover:bg-gray-200 text-gray-600'
                }`}
              >
                {t('cancelSelection')}
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {t('batchDeleteChats')}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className={`flex-1 overflow-y-auto ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        {currentPageData.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            <p className="text-sm">{t('noRecordsFound')}</p>
          </div>
        ) : (
          currentPageData.map(chat => (
            <div
              key={chat.id}
              className={`p-3 cursor-pointer transition-colors border-b ${
                isDarkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'
              } ${selectedChatIds.includes(chat.id) ? (isDarkMode ? 'bg-gray-700' : 'bg-gray-100') : ''}`}
              onClick={() => onLoad(chat)}
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-start space-x-3" style={{ minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={selectedChatIds.includes(chat.id)}
                    onChange={(e) => handleSelectChat(chat.id, e)}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-4 h-4 rounded mt-2 flex-shrink-0 cursor-pointer ${
                      isDarkMode ? 'accent-green-500' : 'accent-green-500'
                    }`}
                  />
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isDarkMode ? 'bg-gray-700' : 'bg-green-100'
                  }`}>
                    <Clock className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />
                  </div>
                  <div className="flex-1" style={{ minWidth: 0, wordBreak: 'break-word' }}>
                    {editingChatId === chat.id ? (
                      <div className="flex items-center space-x-2 mb-1">
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          className={`flex-1 px-2 py-1 border rounded-lg text-sm outline-none ${
                            isDarkMode ? 'bg-gray-600 border-gray-500 text-white' : 'border-green-500'
                          }`}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveTitle(chat.id);
                            if (e.key === 'Escape') setEditingChatId(null);
                          }}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveTitle(chat.id);
                          }}
                          className="px-3 py-1 text-green-500 hover:bg-green-50 rounded"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 mb-1">
                        <p className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                          {highlightKeyword(chat.title, searchQuery)}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingChatId(chat.id);
                            setEditingTitle(chat.title);
                          }}
                          className={`px-3 py-1 transition-colors ${isDarkMode ? 'text-gray-500 hover:text-green-400' : 'text-gray-400 hover:text-green-500'}`}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mb-1">
                      {formatTimestamp(chat.createdAt)} · {chat.messages.length} {t('messagesCount')}
                    </p>
                    {chat.note && (
                      <div className="flex items-start space-x-2 mb-1">
                        <FileText className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                        <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} px-2 py-1 rounded`} style={{ backgroundColor: isDarkMode ? '#4A5568' : '#D1D5DB', wordBreak: 'break-word', overflowWrap: 'break-word', maxHeight: '10em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 10, WebkitBoxOrient: 'vertical' }}>
                          {highlightKeyword(chat.note, searchQuery)}
                        </p>
                      </div>
                    )}
                    <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: '100%', whiteSpace: 'pre-wrap' }}>
                      {chat.messages.length > 0 ? highlightKeyword(chat.messages[0].content.slice(0, 80) + (chat.messages[0].content.length > 80 ? '...' : ''), searchQuery) : t('emptyChat')}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:space-x-1 ml-2 flex-shrink-0 gap-1 sm:gap-0">
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(chat.id);
                      }}
                      className={`p-2 rounded-full transition-colors ${
                        chat.isPinned 
                          ? (isDarkMode ? 'text-red-400 hover:bg-red-900' : 'text-red-500 hover:bg-red-50')
                          : (isDarkMode ? 'text-gray-500 hover:text-red-400 hover:bg-gray-700' : 'text-gray-400 hover:text-red-500 hover:bg-red-50')
                      }`}
                      title={chat.isPinned ? t('unpin') : t('pin')}
                    >
                      <Pin className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowNoteModal(chat.id);
                        setNoteContent(chat.note || '');
                      }}
                      className={`p-2 rounded-full transition-colors ${
                        isDarkMode ? 'text-gray-500 hover:text-green-400 hover:bg-gray-700' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'
                      }`}
                      title={t('addNote')}
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExport(chat);
                      }}
                      className={`p-2 rounded-full transition-colors ${
                        isDarkMode ? 'text-gray-500 hover:text-green-400 hover:bg-gray-700' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'
                      }`}
                      title="导出"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {confirmDelete === chat.id ? (
                      <div className="flex space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(chat.id);
                          }}
                          className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                        >
                          {t('confirm')}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(null);
                          }}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            isDarkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          {t('cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete(chat.id);
                        }}
                        className={`p-2 rounded-full transition-colors ${
                          isDarkMode ? 'text-gray-500 hover:text-red-400 hover:bg-red-900' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                        }`}
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {totalPages > 1 && (
        <div className={`p-4 border-t flex items-center justify-between ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}>
          <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {t('totalRecords')} {filteredHistory.length} {t('records')}，{t('page')} {currentPage} / {totalPages}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                currentPage === 1
                  ? isDarkMode
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('previousPage')}
            </button>
            
            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-green-500 text-white'
                        : isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                currentPage === totalPages
                  ? isDarkMode
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t('nextPage')}
            </button>
          </div>
        </div>
      )}

      {showNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl shadow-xl w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <h3 className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{t('addNote')}</h3>
            </div>
            <div className="p-4">
              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder={t('enterNote')}
                className={`w-full h-32 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500 resize-none ${
                  isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300'
                }`}
              />
            </div>
            <div className={`p-4 border-t flex space-x-3 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <button
                onClick={() => {
                  setShowNoteModal(null);
                  setNoteContent('');
                }}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSaveNote}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
