import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Message, ChatHistory, SearchResult } from '../types';
import { saveChatHistory, getChatHistoryByUserId, deleteChatHistory, saveMessage, getMessagesByChatId, deleteMessage as dbDeleteMessage } from '../db/indexedDB';

const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const generateTitle = (messages: Message[], t: (key: string) => string): string => {
  if (messages.length === 0) return t('noTitleChat');
  const firstUserMessage = messages.find(m => m.sender === 'user');
  if (firstUserMessage) {
    return firstUserMessage.content.length > 30
      ? firstUserMessage.content.slice(0, 30) + '...'
      : firstUserMessage.content;
  }
  return t('noTitleChat');
};

const formatTimestamp = (date: Date): string => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
};

export const useChat = (userId: string | null, defaultReply: string = '收到！') => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const currentChatId = useRef<string | null>(null);
  const defaultReplyRef = useRef(defaultReply);
  const chatHistoryRef = useRef<ChatHistory[]>([]);
  const userIdRef = useRef(userId);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    chatHistoryRef.current = chatHistory;
  }, [chatHistory]);

  useEffect(() => {
    defaultReplyRef.current = defaultReply;
  }, [defaultReply]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!userId) return;
      try {
        const histories = await getChatHistoryByUserId(userId);
        // 排序：置顶记录在前，然后按创建日期降序
        const sortedHistories = [...histories].sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setChatHistory(sortedHistories);
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };

    loadHistory();
  }, [userId]);

  const sendMessage = useCallback(async (content: string, image?: string) => {
    const uid = userIdRef.current;
    const userMessage: Message = {
      id: generateId(),
      content: content.trim(),
      sender: 'user',
      timestamp: new Date(),
      image: image,
    };

    setMessages(prev => [...prev, userMessage]);

    await new Promise(resolve => setTimeout(resolve, 200));

    const botMessage: Message = {
      id: generateId(),
      content: defaultReplyRef.current,
      sender: 'bot',
      timestamp: new Date(),
    };

    setMessages(prev => {
      const newMessages = [...prev, botMessage];
      if (uid) {
        setTimeout(() => saveCurrentChat(uid, newMessages), 0);
      }
      return newMessages;
    });
  }, []);

  const saveCurrentChat = useCallback(async (uid: string, msgs?: Message[]) => {
    const messagesToSave = msgs || messages;
    if (messagesToSave.length === 0 || !uid) return;

    const chatId = currentChatId.current;
    const chats = chatHistoryRef.current;

    try {
      if (chatId) {
        const existingChat = chats.find(c => c.id === chatId);
        if (existingChat && currentChatId.current === chatId) {
          const updatedChat: ChatHistory = {
            ...existingChat,
            messages: [...messagesToSave],
            updatedAt: new Date(),
          };
          await saveChatHistory(updatedChat);
          if (currentChatId.current === chatId) {
            setChatHistory(prev => {
              const updated = prev.map(c => c.id === chatId ? updatedChat : c);
              return updated.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              });
            });
          }
        }
      } else {
        const newChat: ChatHistory = {
          id: generateId(),
          userId: uid,
          title: generateTitle(messagesToSave, t),
          messages: [...messagesToSave],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        currentChatId.current = newChat.id;
        await saveChatHistory(newChat);
        setChatHistory(prev => {
          const updated = [newChat, ...prev];
          return updated.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        });
      }
    } catch (error) {
      console.error('Failed to save chat:', error);
    }
  }, [messages]);

  const loadChat = useCallback(async (chat: ChatHistory) => {
    try {
      const chatMessages = await getMessagesByChatId(chat.id);
      const loadedMessages = chatMessages.length > 0 ? chatMessages : chat.messages;
      setMessages(loadedMessages);
    } catch {
      setMessages(chat.messages);
    }
    currentChatId.current = chat.id;
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    if (currentChatId.current === chatId) {
      currentChatId.current = null;
    }

    try {
      await deleteChatHistory(chatId);
      setChatHistory(prev => prev.filter(c => c.id !== chatId));
    } catch (error) {
      console.error('Failed to delete chat:', error);
      setChatHistory(prev => prev.filter(c => c.id !== chatId));
    }
  }, []);

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      await dbDeleteMessage(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }

    setMessages(prev => prev.filter(m => m.id !== messageId));

    // Also update the chat_history record so the deletion persists across reloads
    const chatId = currentChatId.current;
    if (chatId) {
      const chats = chatHistoryRef.current;
      const existingChat = chats.find(c => c.id === chatId);
      if (existingChat && currentChatId.current === chatId) {
        const filtered = existingChat.messages.filter(m => m.id !== messageId);
        const updatedChat = {
          ...existingChat,
          messages: filtered,
          updatedAt: new Date(),
        };
        saveChatHistory(updatedChat).then(() => {
          if (currentChatId.current === chatId) {
            setChatHistory(prevHist => prevHist.map(c => c.id === chatId ? updatedChat : c));
          }
        });
      }
    }
  }, []);

  // 删除任意对话中的留言（留言流水用），若对话删空则一并删除该对话
  const deleteMessageInChat = useCallback(async (chatId: string, messageId: string) => {
    try {
      await dbDeleteMessage(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }

    if (currentChatId.current === chatId) {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    }

    const chat = chatHistoryRef.current.find(c => c.id === chatId);
    if (!chat) return;

    const filtered = chat.messages.filter(m => m.id !== messageId);
    if (filtered.length === 0) {
      if (currentChatId.current === chatId) {
        currentChatId.current = null;
      }
      try {
        await deleteChatHistory(chatId);
      } catch (error) {
        console.error('Failed to delete chat:', error);
      }
      setChatHistory(prev => prev.filter(c => c.id !== chatId));
      return;
    }

    const updatedChat = { ...chat, messages: filtered, updatedAt: new Date() };
    try {
      await saveChatHistory(updatedChat);
    } catch (error) {
      console.error('Failed to save chat:', error);
    }
    setChatHistory(prev => prev.map(c => c.id === chatId ? updatedChat : c));
  }, []);

  const deleteAllMessages = useCallback(async () => {
    try {
      for (const message of messages) {
        await dbDeleteMessage(message.id);
      }
      
      if (currentChatId.current) {
        await deleteChatHistory(currentChatId.current);
        setChatHistory(prev => prev.filter(c => c.id !== currentChatId.current));
        currentChatId.current = null;
      }
    } catch (error) {
      console.error('Failed to delete messages:', error);
    }
    setMessages([]);
  }, [messages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    currentChatId.current = null;
  }, []);

  const updateChatTitle = useCallback(async (chatId: string, title: string) => {
    try {
      const chat = chatHistory.find(c => c.id === chatId);
      if (chat) {
        const updatedChat = { ...chat, title };
        await saveChatHistory(updatedChat);
        setChatHistory(prev => prev.map(c => c.id === chatId ? updatedChat : c));
      }
    } catch (error) {
      console.error('Failed to update chat title:', error);
      setChatHistory(prev => prev.map(c => c.id === chatId ? { ...c, title } : c));
    }
  }, [chatHistory]);

  const updateChatNote = useCallback(async (chatId: string, note: string) => {
    try {
      const chat = chatHistory.find(c => c.id === chatId);
      if (chat) {
        const updatedChat = { ...chat, note };
        await saveChatHistory(updatedChat);
        setChatHistory(prev => prev.map(c => c.id === chatId ? updatedChat : c));
      }
    } catch (error) {
      console.error('Failed to update chat note:', error);
      setChatHistory(prev => prev.map(c => c.id === chatId ? { ...c, note } : c));
    }
  }, [chatHistory]);

  const togglePinChat = useCallback(async (chatId: string) => {
    try {
      const chat = chatHistory.find(c => c.id === chatId);
      if (chat) {
        const updatedChat = { ...chat, isPinned: !chat.isPinned };
        await saveChatHistory(updatedChat);
        setChatHistory(prev => {
          const updated = prev.map(c => c.id === chatId ? updatedChat : c);
          return updated.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });
        });
      }
    } catch (error) {
      console.error('Failed to toggle chat pin:', error);
      setChatHistory(prev => {
        const updated = prev.map(c => c.id === chatId ? { ...c, isPinned: !c.isPinned } : c);
        return updated.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      });
    }
  }, [chatHistory]);

  const searchChats = useCallback((query: string): SearchResult[] => {
    if (!query.trim()) return [];
    
    const lowerQuery = query.toLowerCase();
    const results: SearchResult[] = [];

    chatHistory.forEach(chat => {
      chat.messages.forEach(message => {
        if (message.content.toLowerCase().includes(lowerQuery)) {
          const startIndex = message.content.toLowerCase().indexOf(lowerQuery);
          const previewStart = Math.max(0, startIndex - 20);
          const previewEnd = Math.min(message.content.length, startIndex + lowerQuery.length + 20);
          const preview = (previewStart > 0 ? '...' : '') + 
            message.content.slice(previewStart, previewEnd) + 
            (previewEnd < message.content.length ? '...' : '');

          results.push({
            chatId: chat.id,
            chatTitle: chat.title,
            messageId: message.id,
            content: message.content,
            preview,
            timestamp: message.timestamp,
          });
        }
      });
    });

    return results.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [chatHistory]);

  const getChatsByDateRange = useCallback((startDate: Date, endDate: Date): ChatHistory[] => {
    return chatHistory.filter(chat => {
      const chatDate = new Date(chat.createdAt);
      return chatDate >= startDate && chatDate <= endDate;
    }).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [chatHistory]);

  const exportChatToWord = useCallback((chat: ChatHistory): string => {
    let content = `聊天记录：${chat.title}\n`;
    content += `创建时间：${formatTimestamp(chat.createdAt)}\n`;
    if (chat.note) {
      content += `备注：${chat.note}\n`;
    }
    content += '\n---\n\n';

    const userMessages = chat.messages.filter(m => m.sender === 'user');
    
    userMessages.forEach((message, index) => {
      content += `${index + 1}. ${message.content}\n`;
      content += `   时间：${formatTimestamp(message.timestamp)}\n\n`;
    });

    return content;
  }, []);

  const exportChatsToWord = useCallback((chats: ChatHistory[]): string => {
    let content = '树洞聊天记录汇总\n';
    content += `导出时间：${formatTimestamp(new Date())}\n`;
    content += `共 ${chats.length} 条记录\n\n`;
    content += '='.repeat(50) + '\n\n';

    chats.forEach((chat, chatIndex) => {
      content += `${chatIndex + 1}. ${chat.title}\n`;
      content += `创建时间：${formatTimestamp(chat.createdAt)}\n`;
      if (chat.note) {
        content += `备注：${chat.note}\n`;
      }
      
      const userMessages = chat.messages.filter(m => m.sender === 'user');
      content += `消息数：${userMessages.length}\n`;
      content += '\n';

      userMessages.forEach((message, msgIndex) => {
        content += `  ${msgIndex + 1}. ${message.content}\n`;
        content += `     时间：${formatTimestamp(message.timestamp)}\n`;
      });

      content += '\n' + '-'.repeat(50) + '\n\n';
    });

    return content;
  }, []);

  return {
    messages,
    chatHistory,
    isTyping,
    sendMessage,
    saveCurrentChat,
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
  };
};
