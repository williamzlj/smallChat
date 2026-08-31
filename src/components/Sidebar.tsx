import { useTranslation } from 'react-i18next';
import { TreePine, History, Plus, Settings, Moon, Sun, Info, User, ListTodo, Shield, Globe, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { User as UserType, BotSettings } from '../types/auth';
import { LanguageSelector } from './LanguageSelector';

interface SidebarProps {
  activeTab: 'chat' | 'history' | 'todo' | 'messageFlow';
  onTabChange: (tab: 'chat' | 'history' | 'todo' | 'messageFlow') => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  user: UserType;
  botSettings: BotSettings;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export const Sidebar = ({ activeTab, onTabChange, onNewChat, onOpenSettings, onOpenAdmin, user, botSettings, isDarkMode, onToggleDarkMode }: SidebarProps) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className={`w-64 border-r flex flex-col h-full transition-colors duration-300 ${
      isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
    }`}>
      <div className={`p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg">
            <TreePine className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{botSettings.productName || t('welcome')}</h1>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>{botSettings.productDescription || t('chatHint')}</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-green-500 to-green-600 text-white py-3 rounded-xl hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-md hover:shadow-lg"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">{t('newChat')}</span>
        </button>
      </div>

      <div className={`flex-1 px-3 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className={`grid grid-cols-2 gap-2 rounded-xl p-2 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <button
            onClick={() => onTabChange('chat')}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all duration-200 ${
              activeTab === 'chat'
                ? `${isDarkMode ? 'bg-gray-600 text-green-400' : 'bg-white shadow-sm text-green-600'}`
                : `${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            <TreePine className="w-8 h-8" />
            <span className="text-sm font-medium mt-2">{t('chat')}</span>
          </button>
          <button
            onClick={() => onTabChange('history')}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all duration-200 ${
              activeTab === 'history'
                ? `${isDarkMode ? 'bg-gray-600 text-green-400' : 'bg-white shadow-sm text-green-600'}`
                : `${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            <History className="w-8 h-8" />
            <span className="text-sm font-medium mt-2">{t('history')}</span>
          </button>
          <button
            onClick={() => onTabChange('messageFlow')}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all duration-200 ${
              activeTab === 'messageFlow'
                ? `${isDarkMode ? 'bg-gray-600 text-green-400' : 'bg-white shadow-sm text-green-600'}`
                : `${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            <MessageSquare className="w-8 h-8" />
            <span className="text-sm font-medium mt-2">{t('messageFlow')}</span>
          </button>
          <button
            onClick={() => onTabChange('todo')}
            className={`flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all duration-200 ${
              activeTab === 'todo'
                ? `${isDarkMode ? 'bg-gray-600 text-green-400' : 'bg-white shadow-sm text-green-600'}`
                : `${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`
            }`}
          >
            <ListTodo className="w-8 h-8" />
            <span className="text-sm font-medium mt-2">{t('todo')}</span>
          </button>
        </div>
      </div>

      <div className={`p-3 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center space-x-3 mb-3 pb-3 border-b border-gray-200">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
            user.avatar && user.avatar.startsWith('data:') ? 'bg-gray-200 overflow-hidden' : (user.avatar || 'bg-blue-500')
          }`}>
            {user.avatar && user.avatar.startsWith('data:') ? (
              <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              {user.username}
            </p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-1">
            <Globe className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          </div>
          <LanguageSelector isDarkMode={isDarkMode} />
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title={t('about')}
          >
            <Info className="w-5 h-5" />
          </button>
          <button
            onClick={onToggleDarkMode}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title={isDarkMode ? t('switchToLightMode') : t('switchToDarkMode')}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={onOpenSettings}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title={t('settings')}
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={onOpenAdmin}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
            title={t('admin')}
          >
            <Shield className="w-5 h-5" />
          </button>
        </div>
        {showInfo && (
          <div className={`mt-3 p-3 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <p
              className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}
              dangerouslySetInnerHTML={{ __html: t('loginIntro') }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
