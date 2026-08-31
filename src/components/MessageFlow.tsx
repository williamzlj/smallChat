import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Trash2, Search, X, Calendar, CheckSquare, FolderOpen } from 'lucide-react';

export interface MessageFlowItem {
  chatId: string;
  chatTitle: string;
  messageId: string;
  content: string;
  timestamp: Date;
  image?: string;
}

interface MessageFlowProps {
  items: MessageFlowItem[];
  onLocate: (chatId: string, messageId: string) => void;
  onDelete: (chatId: string, messageId: string) => void;
  isDarkMode?: boolean;
  formatTimestamp: (date: Date) => string;
}

export const MessageFlow = ({ items, onLocate, onDelete, isDarkMode = false, formatTimestamp }: MessageFlowProps) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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

  const filteredItems = items.filter(item => {
    const itemDate = new Date(item.timestamp);

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (itemDate < start) return false;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (itemDate > end) return false;
    }

    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.content.toLowerCase().includes(query) ||
      item.chatTitle.toLowerCase().includes(query)
    );
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPageData = filteredItems.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === currentPageData.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(currentPageData.map(item => item.messageId));
    }
  };

  const handleSelectItem = (messageId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    );
  };

  const handleBatchDelete = () => {
    const selectedItems = currentPageData.filter(item => selectedIds.includes(item.messageId));
    if (selectedItems.length === 0) return;

    if (confirm(`${t('confirmDeleteSelected')} ${selectedItems.length} ${t('messages')}`)) {
      selectedItems.forEach(item => onDelete(item.chatId, item.messageId));
      setSelectedIds([]);
    }
  };

  const handleDelete = (chatId: string, messageId: string) => {
    onDelete(chatId, messageId);
    setConfirmDelete(null);
  };

  if (items.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <FolderOpen className="w-8 h-8" />
        </div>
        <p className="text-sm">{t('noChatsFound')}</p>
        <p className="text-xs mt-1">{t('messageFlow')}</p>
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
                }}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 transition-colors ${
                  isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 mt-3 gap-2 flex-wrap">
          <button
            onClick={handleSelectAll}
            title={t('selectAll')}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedIds.length === currentPageData.length && currentPageData.length > 0
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
                setCurrentPage(1);
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
                setCurrentPage(1);
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
          {selectedIds.length > 0 && (
            <div className="flex items-center space-x-2 ml-auto">
              <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {t('selected')} {selectedIds.length} {t('records')}
              </span>
              <button
                onClick={() => setSelectedIds([])}
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
                {t('batchDelete')}
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
          currentPageData.map(item => (
            <div
              key={item.messageId}
              className={`p-3 cursor-pointer transition-colors border-b ${
                isDarkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'
              } ${selectedIds.includes(item.messageId) ? (isDarkMode ? 'bg-gray-700' : 'bg-gray-100') : ''}`}
              onClick={() => onLocate(item.chatId, item.messageId)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start space-x-3" style={{ minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.messageId)}
                    onChange={(e) => handleSelectItem(item.messageId, e)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded mt-2 flex-shrink-0 cursor-pointer accent-green-500"
                  />
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isDarkMode ? 'bg-gray-700' : 'bg-green-100'
                  }`}>
                    <MessageSquare className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />
                  </div>
                  <div className="flex-1" style={{ minWidth: 0, wordBreak: 'break-word' }}>
                    <p className={`text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'} mb-1`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
                      {highlightKeyword(item.content.length > 200 ? item.content.slice(0, 200) + '...' : item.content, searchQuery)}
                      {item.image ? ' 🖼️' : ''}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatTimestamp(item.timestamp)} · <span className={isDarkMode ? 'text-gray-500' : 'text-gray-500'}>{highlightKeyword(item.chatTitle, searchQuery)}</span>
                    </p>
                  </div>
                </div>

                <div className="ml-2 flex-shrink-0">
                  {confirmDelete === item.messageId ? (
                    <div className="flex space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.chatId, item.messageId);
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
                        setConfirmDelete(item.messageId);
                      }}
                      className={`p-2 rounded-full transition-colors ${
                        isDarkMode ? 'text-gray-500 hover:text-red-400 hover:bg-red-900' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                      }`}
                      title={t('delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
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
            {t('totalRecords')} {filteredItems.length} {t('records')}，{t('page')} {currentPage} / {totalPages}
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
    </div>
  );
};
