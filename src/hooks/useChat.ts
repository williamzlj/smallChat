import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { ChatMessage, User } from '../api/types';
import { POLL_INTERVAL, INITIAL_MSG_LIMIT, HISTORY_LIMIT } from '../config';

// 单个群聊的消息：初始加载 + 增量轮询 + 向上翻历史 + 发送/上传/删除
export const useChat = (groupId: number | null, currentUser: User | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const maxIdRef = useRef(0);
  const minIdRef = useRef(0);
  const groupIdRef = useRef<number | null>(groupId);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 增量消息合并（upsert，按 id 排序；temp 消息保留）
  const mergeMessages = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      // 轮询可能先于本地 send 成功回调拿到刚发的消息：丢弃对应的 temp，避免重复
      const tempDuplicatesServer = (t: ChatMessage) =>
        !!t.clientTempId &&
        incoming.some(
          (m) =>
            m.user_id === t.user_id &&
            m.type === t.type &&
            (t.type === 'text' ? m.content === t.content : m.file?.name === t.content),
        );
      const map = new Map<number | string, ChatMessage>();
      prev.forEach((m) => {
        if (tempDuplicatesServer(m)) return;
        map.set(m.clientTempId ? `tmp:${m.clientTempId}` : m.id, m);
      });
      incoming.forEach((m) => {
        map.set(m.id, m);
        if (m.id > maxIdRef.current) maxIdRef.current = m.id;
      });
      return Array.from(map.values()).sort((a, b) => realId(a) - realId(b));
    });
  }, []);

  // 进入群聊：拉最近消息
  useEffect(() => {
    groupIdRef.current = groupId;
    if (groupId === null) {
      setMessages([]);
      maxIdRef.current = 0;
      minIdRef.current = 0;
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessages([]);
    maxIdRef.current = 0;
    minIdRef.current = 0;

    (async () => {
      try {
        const { messages: list, max_id } = await api.messagesList(
          groupId,
          0,
          INITIAL_MSG_LIMIT,
        );
        if (cancelled || groupIdRef.current !== groupId) return;
        setMessages(list);
        maxIdRef.current = max_id;
        if (list.length > 0) {
          minIdRef.current = list[0].id;
          // 拉满一页说明可能还有更早的历史
          setHasMore(list.length >= INITIAL_MSG_LIMIT);
        } else {
          setHasMore(false);
        }
      } catch (e) {
        console.warn('加载消息失败', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // 增量轮询（页面可见时）
  useEffect(() => {
    if (groupId === null) return;

    const poll = async () => {
      if (document.hidden || groupIdRef.current !== groupId) return;
      try {
        const { messages: list, max_id } = await api.messagesList(
          groupId,
          maxIdRef.current,
          100,
        );
        if (list.length > 0) {
          mergeMessages(list);
        } else {
          maxIdRef.current = max_id;
        }
      } catch {
        // 网络波动忽略，下个周期重试
      }
    };

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [groupId, mergeMessages]);

  // 向上加载更早的历史
  const loadMore = useCallback(async () => {
    if (groupId === null || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { messages: older, has_more } = await api.messagesHistory(
        groupId,
        minIdRef.current,
        HISTORY_LIMIT,
      );
      if (older.length > 0) {
        minIdRef.current = older[0].id;
        setMessages((prev) => {
          const map = new Map<number, ChatMessage>();
          older.forEach((m) => map.set(m.id, m));
          prev.forEach((m) => {
            if (!m.clientTempId) map.set(m.id, m);
          });
          const merged = Array.from(map.values()).sort((a, b) => a.id - b.id);
          // 保留 temp 消息
          const temps = prev.filter((m) => m.clientTempId);
          return [...merged, ...temps];
        });
      }
      setHasMore(has_more === 1);
    } catch (e) {
      console.warn('加载历史失败', e);
    } finally {
      setLoadingMore(false);
    }
  }, [groupId, loadingMore, hasMore]);

  // 发送文本
  const sendText = useCallback(
    async (content: string): Promise<void> => {
      const gid = groupIdRef.current;
      if (!gid || !currentUser || !content.trim()) return;
      setSending(true);
      const tempId = `t${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      const temp: ChatMessage = {
        id: -Date.now(),
        group_id: gid,
        user_id: currentUser.id,
        nickname: currentUser.nickname,
        color: currentUser.color,
        type: 'text',
        content: content.trim(),
        file: null,
        is_todo: 0,
        deleted: 0,
        created_at: nowText(),
        status: 'sending',
        clientTempId: tempId,
      };
      setMessages((prev) => [...prev, temp]);
      try {
        const { id, created_at } = await api.messagesSend({
          group_id: gid,
          type: 'text',
          content: content.trim(),
        });
        if (id > maxIdRef.current) maxIdRef.current = id;
        setMessages((prev) =>
          prev
            .map((m) =>
              m.clientTempId === tempId
                ? { ...m, id, created_at, status: undefined, clientTempId: undefined }
                : m,
            )
        );
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => (m.clientTempId === tempId ? { ...m, status: 'failed' } : m)),
        );
        throw e;
      } finally {
        setSending(false);
      }
    },
    [currentUser],
  );

  // 发送图片/文件：先上传文件，再发消息
  const sendFileMessage = useCallback(
    async (file: File | Blob, filename: string, kind: 'image' | 'file'): Promise<void> => {
      const gid = groupIdRef.current;
      if (!gid || !currentUser) return;
      setSending(true);
      setUploadProgress(0);
      const tempId = `t${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
      const temp: ChatMessage = {
        id: -Date.now(),
        group_id: gid,
        user_id: currentUser.id,
        nickname: currentUser.nickname,
        color: currentUser.color,
        type: kind,
        content: kind === 'file' ? filename : '',
        file: null,
        is_todo: 0,
        deleted: 0,
        created_at: nowText(),
        status: 'sending',
        clientTempId: tempId,
      };
      setMessages((prev) => [...prev, temp]);
      try {
        const up = await api.upload(file, filename, (p) => setUploadProgress(p));
        const { id, created_at } = await api.messagesSend({
          group_id: gid,
          type: kind,
          content: kind === 'file' ? filename : '',
          file_id: up.file_id,
        });
        if (id > maxIdRef.current) maxIdRef.current = id;
        setMessages((prev) =>
          prev.map((m) =>
            m.clientTempId === tempId
              ? {
                  ...m,
                  id,
                  created_at,
                  status: undefined,
                  clientTempId: undefined,
                  file: {
                    id: up.file_id,
                    url: up.url,
                    name: up.name,
                    mime: up.mime,
                    size: up.size,
                  },
                }
              : m,
          ),
        );
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) => (m.clientTempId === tempId ? { ...m, status: 'failed' } : m)),
        );
        throw e;
      } finally {
        setSending(false);
        setUploadProgress(null);
      }
    },
    [currentUser],
  );

  // 删除消息（软删除，本地立即更新，轮询会同步到其他设备）
  const deleteMessage = useCallback(async (id: number) => {
    const target = messages.find((m) => m.id === id);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, deleted: 1, content: '', file: null } : m,
      ),
    );
    try {
      await api.messagesDelete(id);
    } catch (e) {
      // 失败回滚
      if (target) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? target : m)),
        );
      }
      throw e;
    }
  }, [messages]);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    sending,
    uploadProgress,
    loadMore,
    sendText,
    sendFileMessage,
    deleteMessage,
  };
};

function realId(m: ChatMessage): number {
  return m.id > 0 ? m.id : Number.MAX_SAFE_INTEGER;
}

function nowText(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
