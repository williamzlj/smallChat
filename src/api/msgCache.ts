// 会话消息本地缓存（IndexedDB）：用于"秒开 + 弱网兜底"。
// 设计要点：
// - 仅作加速层，服务器仍是唯一权威；任何缓存异常都只退化为网络加载，不影响数据正确性。
// - 每个群只缓存最近 CACHE_MAX 条消息（约 6 页），文本体积小。
// - 不缓存私有备注（my_note 属私有，写入前剥离），避免本地泄露。
// - 登出时整体清空。

import { ChatMessage } from './types';

const DB_NAME = 'smallchat-msg-cache';
const STORE = 'messages';
// 缓存条数上限：INITIAL_MSG_LIMIT(100) 一页 + 向上翻 5 页 HISTORY_LIMIT(50) ≈ 300 条
const CACHE_MAX = 300;

interface CacheRow {
  group_id: number;
  messages: ChatMessage[];
  updated_at: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'group_id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

// 写入前剥离私有字段，减小体积并避免私密内容落盘
function stripPrivate(list: ChatMessage[]): ChatMessage[] {
  return list.map((m) => {
    const rec = m as ChatMessage & { my_note?: string };
    if (rec.my_note) {
      const { my_note: _omit, ...rest } = rec;
      return rest as ChatMessage;
    }
    return m;
  });
}

// 读取某群缓存的消息（无缓存或异常时返回 null）
export async function readMsgCache(groupId: number): Promise<ChatMessage[] | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(groupId);
      req.onsuccess = () => {
        const row = req.result as CacheRow | undefined;
        resolve(row && Array.isArray(row.messages) && row.messages.length > 0 ? row.messages : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// 覆盖写入某群缓存（保留最近 CACHE_MAX 条，按 id 升序）
export async function writeMsgCache(groupId: number, messages: ChatMessage[]): Promise<void> {
  const db = await openDB();
  if (!db) return;
  const real = messages.filter((m) => !m.clientTempId && m.id > 0);
  if (real.length === 0) return;
  const sorted = [...real].sort((a, b) => a.id - b.id);
  const trimmed = stripPrivate(sorted.slice(-CACHE_MAX));
  const row: CacheRow = { group_id: groupId, messages: trimmed, updated_at: Date.now() };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

// 清空全部缓存（登出时调用）
export async function clearMsgCache(): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
