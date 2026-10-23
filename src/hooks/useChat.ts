import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { ChatMessage, User } from '../api/types';
import { POLL_INTERVAL, INITIAL_MSG_LIMIT, HISTORY_LIMIT } from '../config';
import { readMsgCache, writeMsgCache } from '../api/msgCache';

export interface SendTextOpts {
  replyTo?: ChatMessage | null; // 引用回复的目标消息
  mentions?: number[]; // 被 @ 的用户 id
}

// 生成引用摘要（与后端 format_message 的 reply 字段一致）
function makeReplySummary(m: ChatMessage) {
  return {
    id: m.id,
    nickname: m.nickname,
    type: m.type,
    content:
      m.type === 'text'
        ? m.content.slice(0, 80)
        : m.type === 'image'
          ? '[图片]'
          : m.type === 'file'
            ? `[文件] ${m.content}`
            : '[聊天记录]',
    deleted: 0,
  };
}

// 单个群聊的消息：初始加载 + 增量轮询 + 向上翻历史 + 发送/上传/删除
export const useChat = (
  groupId: number | null,
  currentUser: User | null,
  focusMsgId: number | null = null,
) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // 从待办/重要面板跳转来的目标消息：加载其附近消息后滚动高亮
  const [highlightMsgId, setHighlightMsgId] = useState<number | null>(null);

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

  // 进入群聊：拉最近消息；若指定 focusMsgId（面板跳转定位）则拉该消息前后各 20 条
  useEffect(() => {
    groupIdRef.current = groupId;
    if (groupId === null) {
      setMessages([]);
      setLoading(false);
      setHasMore(false);
      setHighlightMsgId(null);
      maxIdRef.current = 0;
      minIdRef.current = 0;
      return;
    }

    let cancelled = false;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
    setHasMore(false);
    setHighlightMsgId(null);
    maxIdRef.current = 0;
    minIdRef.current = 0;

    // 定位模式（面板跳转）不读缓存，直接走网络定位
    const isFocusMode = !!(focusMsgId && focusMsgId > 0);

    // 秒开：先从本地缓存渲染上次的消息，后台再用服务器数据覆盖
    let hadCache = false;
    if (!isFocusMode) {
      const cached = await readMsgCache(groupId);
      if (!cancelled && groupIdRef.current === groupId && cached && cached.length > 0) {
        hadCache = true;
        setMessages(cached);
        maxIdRef.current = cached[cached.length - 1].id;
        minIdRef.current = cached[0].id;
        // 缓存条数达到一页，说明可能还有更早历史
        setHasMore(cached.length >= INITIAL_MSG_LIMIT);
      }
    }
    // 有缓存时已能展示内容，无需 loading 转圈；无缓存才显示加载态
    setLoading(!hadCache);
    if (!hadCache) setMessages([]);

    // 安全超时：15 秒后强制结束加载态，避免网络异常时一直转圈
    safetyTimer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 15000);

    try {
        if (isFocusMode) {
          // 定位模式：以目标消息为中心拉取一页
          const { messages: list, has_more_before } = await api.messagesAround(
            groupId,
            focusMsgId,
            20,
          );
          if (cancelled || groupIdRef.current !== groupId) return;
          setMessages(list);
          setHighlightMsgId(focusMsgId);
          if (list.length > 0) {
            maxIdRef.current = list[list.length - 1].id;
            minIdRef.current = list[0].id;
          } else {
            maxIdRef.current = focusMsgId;
            minIdRef.current = focusMsgId;
          }
          setHasMore(has_more_before === 1);
          return;
        }
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
          // 用服务器最新一页覆盖缓存（旧缓存里的更早历史会在 loadMore 时重新并入）
          void writeMsgCache(groupId, list);
        } else {
          setHasMore(false);
        }
    } catch (e) {
        console.warn('加载消息失败', e);
    } finally {
        if (safetyTimer) clearTimeout(safetyTimer);
        // 仅当当前群未变时才重置 loading，避免覆盖新群的加载态
        if (groupIdRef.current === groupId) setLoading(false);
    }
    })();

    return () => {
      cancelled = true;
      if (safetyTimer) clearTimeout(safetyTimer);
    };
  }, [groupId, focusMsgId]);

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
          // 把并入更早历史后的完整列表写回缓存（凑满 6 页，弱网可翻最近几天）
          void writeMsgCache(groupId, merged);
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

  // 发送文本（可选引用回复 / @提醒）
  const sendText = useCallback(
    async (content: string, opts?: SendTextOpts): Promise<void> => {
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
        avatar_ver: currentUser.avatar_ver,
        type: 'text',
        content: content.trim(),
        file: null,
        is_todo: 0,
        todo_status: 0,
        todo_note: null,
        todo_archived: 0,
        important_archived: 0,
        due_at: null,
        note: '',
        reply_to: opts?.replyTo?.id ?? 0,
        reply: opts?.replyTo ? makeReplySummary(opts.replyTo) : null,
        mentions: opts?.mentions ?? [],
        edited_at: null,
        deleted: 0,
        recalled: 0,
        color_mark: 0,
        amount_kind: 0,
        amount_cents: null,
        amount_cat: '',
        amount_date: null,
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
          ...(opts?.replyTo ? { reply_to: opts.replyTo.id } : {}),
          ...(opts?.mentions && opts.mentions.length > 0 ? { mentions: opts.mentions } : {}),
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
        avatar_ver: currentUser.avatar_ver,
        type: kind,
        content: kind === 'file' ? filename : '',
        file: null,
        is_todo: 0,
        todo_status: 0,
        todo_note: null,
        todo_archived: 0,
        important_archived: 0,
        due_at: null,
        note: '',
        reply_to: 0,
        reply: null,
        mentions: [],
        edited_at: null,
        deleted: 0,
        recalled: 0,
        color_mark: 0,
        amount_kind: 0,
        amount_cents: null,
        amount_cat: '',
        amount_date: null,
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

  // 撤回消息（作者本人 2 分钟内，本地立即标记 recalled，轮询同步其他设备）
  const recallMessage = useCallback(async (id: number) => {
    const target = messages.find((m) => m.id === id);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, deleted: 1, recalled: 1, content: '', file: null } : m,
      ),
    );
    try {
      await api.messagesRecall(id);
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

  // 设置待办状态（0普通 1待办 2已完成），note 传 undefined 不修改备注
  const setTodoStatus = useCallback(
    async (id: number, status: number, note?: string) => {
      const target = messages.find((m) => m.id === id);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                todo_status: status,
                todo_note: note !== undefined ? note : m.todo_note,
                // 转回普通消息时清掉提醒（与后端行为一致）
                due_at: status === 0 ? null : m.due_at,
              }
            : m,
        ),
      );
      try {
        await api.messagesSetTodo(id, status, note);
      } catch (e) {
        // 失败回滚
        if (target) {
          setMessages((prev) => prev.map((m) => (m.id === id ? target : m)));
        }
        throw e;
      }
    },
    [messages],
  );

  // 设置颜色标记（0无 1红 2橙 3蓝）
  const setColorStatus = useCallback(
    async (id: number, color: number) => {
      const target = messages.find((m) => m.id === id);
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, color_mark: color } : m)),
      );
      try {
        await api.messagesSetColor(id, color);
      } catch (e) {
        if (target) {
          setMessages((prev) => prev.map((m) => (m.id === id ? target : m)));
        }
        throw e;
      }
    },
    [messages],
  );

  return {
    messages,
    setMessages,
    loading,
    loadingMore,
    hasMore,
    sending,
    uploadProgress,
    highlightMsgId,
    setHighlightMsgId,
    loadMore,
    sendText,
    sendFileMessage,
    deleteMessage,
    recallMessage,
    setTodoStatus,
    setColorStatus,
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
