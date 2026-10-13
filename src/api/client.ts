// 后端 API 封装：单入口 api.php?action=xxx
// 景安主机会剥离 Authorization 头，统一使用 X-Auth-Token 自定义头
import { API_BASE } from '../config';
import { User, Group, GroupMember, ChatMessage, TokenInfo } from './types';

const TOKEN_KEY = 'smallchat-token';
const USER_KEY = 'smallchat-user';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// 登录态失效回调（401 时通知应用退出登录）
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(fn: () => void) {
  unauthorizedHandler = fn;
}

export const tokenStore = {
  get(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  getUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  setUser(user: User) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
};

interface RequestOptions {
  method?: 'GET' | 'POST';
  params?: Record<string, string | number>;
  body?: Record<string, unknown> | null;
  auth?: boolean; // 是否带 token（默认 true）
}

async function request<T>(action: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'POST', params, body, auth = true } = opts;
  const url = new URL(`${API_BASE}/api.php`);
  url.searchParams.set('action', action);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }

  const headers: Record<string, string> = {};
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = tokenStore.get();
    if (token) headers['X-Auth-Token'] = token;
  }

  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('网络连接失败，请检查网络', 0);
  }

  let json: { ok: boolean; data?: T; error?: string };
  try {
    json = await resp.json();
  } catch {
    throw new ApiError(`服务器响应异常（HTTP ${resp.status}）`, resp.status);
  }

  if (resp.status === 401) {
    tokenStore.clear();
    unauthorizedHandler?.();
    throw new ApiError(json.error || '登录已失效', 401);
  }
  if (!json.ok) {
    throw new ApiError(json.error || '请求失败', resp.status);
  }
  return json.data as T;
}

const get = <T,>(action: string, params?: Record<string, string | number>) =>
  request<T>(action, { method: 'GET', params });

const post = <T,>(action: string, body?: Record<string, unknown>) =>
  request<T>(action, { method: 'POST', body: body ?? {} });

// ==================== 认证 ====================

export const api = {
  ping: () =>
    get<{ time: string }>('ping')
      .then(() => true)
      .catch(() => false),

  register: (data: { username: string; password: string; invite_code: string; nickname?: string }) =>
    post<{ id: number }>('register', data),

  login: (data: { username: string; password: string; device_name?: string }) =>
    post<{ token: string; expires_at: string; user: User }>('login', data),

  logout: () => post('logout'),

  me: () => get<{ user: User; device_name: string }>('me'),

  updateProfile: (data: { nickname?: string; color?: string; old_password?: string; new_password?: string }) =>
    post<{ user: User }>('user.update', data),

  tokensList: () => get<{ tokens: TokenInfo[] }>('tokens.list'),
  tokensRevoke: (token: string) => post('tokens.revoke', { token }),

  // ==================== 群组 ====================

  groupsList: () => get<{ groups: Group[] }>('groups.list'),
  groupsCreate: (name: string) => post<{ id: number }>('groups.create', { name }),
  groupsRename: (group_id: number, name: string) =>
    post('groups.rename', { group_id, name }),
  groupsInvite: (group_id: number, username: string) =>
    post<{ member: GroupMember }>('groups.invite', { group_id, username }),
  groupsMembers: (group_id: number) =>
    get<{ members: GroupMember[] }>('groups.members', { group_id }),
  groupsLeave: (group_id: number) => post('groups.leave', { group_id }),
  groupsDelete: (group_id: number) => post('groups.delete', { group_id }),

  // ==================== 消息 ====================

  messagesSend: (data: {
    group_id: number;
    type?: 'text' | 'image' | 'file';
    content?: string;
    file_id?: number;
  }) => post<{ id: number; created_at: string }>('messages.send', data),

  messagesList: (group_id: number, since_id: number, limit = 100) =>
    get<{ messages: ChatMessage[]; max_id: number }>('messages.list', {
      group_id,
      since_id,
      limit,
    }),

  messagesHistory: (group_id: number, before_id: number, limit = 50) =>
    get<{ messages: ChatMessage[]; has_more: number }>('messages.history', {
      group_id,
      before_id,
      limit,
    }),

  messagesDelete: (id: number) => post('messages.delete', { id }),

  // ==================== 文件上传（multipart，XHR 以支持进度） ====================

  upload(
    file: File | Blob,
    filename: string,
    onProgress?: (percent: number) => void,
  ): Promise<{ file_id: number; url: string; name: string; mime: string; size: number }> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file, filename);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api.php?action=upload`);
      const token = tokenStore.get();
      if (token) xhr.setRequestHeader('X-Auth-Token', token);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status === 401) {
            tokenStore.clear();
            unauthorizedHandler?.();
          }
          if (json.ok) {
            resolve(json.data);
          } else {
            reject(new ApiError(json.error || '上传失败', xhr.status));
          }
        } catch {
          reject(new ApiError(`上传响应异常（HTTP ${xhr.status}）`, xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError('上传失败，网络错误', 0));
      xhr.send(form);
    });
  },
};
