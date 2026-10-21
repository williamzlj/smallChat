// 后端 API 封装：单入口 api.php?action=xxx
// 景安主机会剥离 Authorization 头，统一使用 X-Auth-Token 自定义头
import { API_BASE } from '../config';
import { User, Group, GroupMember, ChatMessage, TokenInfo, Friend, FriendInfo, SearchResult, ReadState, CrossGroupMessage, Category, LedgerData, LedgerDetail } from './types';

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
  // token 走 URL query 参数：景安 WAF 拦截 OPTIONS 预检，不能用自定义请求头
  // （X-Auth-Token 会触发预检；放 query 后整条请求为 simple request，不发 OPTIONS）
  if (auth) {
    const token = tokenStore.get();
    if (token) url.searchParams.set('token', token);
  }

  const headers: Record<string, string> = {};
  if (body !== undefined && body !== null) {
    // text/plain 是 CORS simple content type，不触发预检；body 仍是 JSON 字符串
    headers['Content-Type'] = 'text/plain;charset=UTF-8';
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

  updateProfile: (data: { nickname?: string; color?: string; signature?: string; card_signature?: string; old_password?: string; new_password?: string }) =>
    post<{ user: User }>('user.update', data),

  // 上传头像（base64，前端已裁剪压缩为 256x256 JPEG）
  setAvatar: (avatar: string) => post<{ avatar_ver: number }>('user.setAvatar', { avatar }),

  // 按版本号拉取头像：ver 与服务端一致时不返回数据（省流量）
  getAvatar: (user_id: number, ver: number) =>
    get<{ changed: boolean; avatar?: string; avatar_ver: number }>('user.getAvatar', { user_id, ver }),

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
  groupsKick: (group_id: number, user_id: number) =>
    post('groups.kick', { group_id, user_id }),
  groupsTransfer: (group_id: number, user_id: number) =>
    post('groups.transfer', { group_id, user_id }),
  groupsArchive: (group_id: number, archived: boolean) =>
    post('groups.archive', { group_id, archived: archived ? 1 : 0 }),
  groupsClone: (group_id: number, name?: string) =>
    post<{ id: number }>('groups.clone', name ? { group_id, name } : { group_id }),
  groupsPin: (group_id: number, message_id: number) =>
    post('groups.pin', { group_id, message_id }), // message_id=0 取消全部置顶
  groupsPins: (group_id: number) =>
    get<{ messages: ChatMessage[] }>('groups.pins', { group_id }),
  groupsSetAdmin: (group_id: number, user_id: number, is_admin: boolean) =>
    post('groups.setAdmin', { group_id, user_id, is_admin: is_admin ? 1 : 0 }),
  // 设置成员角色（仅群主可调用）：0=普通成员 1=副群主 2=观察者
  groupsSetRole: (group_id: number, user_id: number, role: 0 | 1 | 2) =>
    post('groups.setRole', { group_id, user_id, role }),
  groupsSetNotice: (group_id: number, announcement: string, description: string) =>
    post('groups.setNotice', { group_id, announcement, description }),
  groupsSetRemark: (group_id: number, remark: string) =>
    post('groups.setRemark', { group_id, remark }),
  // 财务记账开关（仅群主/副群主可切换；默认关闭，关闭后该群不显示任何记账入口）
  groupsSetLedger: (group_id: number, enabled: boolean) =>
    post<{ ledger_enabled: number }>('groups.setLedger', { group_id, enabled: enabled ? 1 : 0 }),
  // 会话置顶：当前用户自己对该群/会话的置顶（多设备同步）
  groupsSetPin: (group_id: number, pinned: number) =>
    post<{ pinned_chat: number }>('groups.setPin', { group_id, pinned }),

  // ==================== 好友与私聊 ====================

  friendsList: () => get<{ friends: Friend[] }>('friends.list'),
  friendsAdd: (username: string) => post<{ friend: Friend }>('friends.add', { username }),
  friendsRemove: (friend_id: number) => post('friends.remove', { friend_id }),
  // 好友备注名/备忘（仅本人可见）
  friendsUpdate: (friend_id: number, data: { alias?: string; memo?: string }) =>
    post('friends.update', { friend_id, ...data }),
  // 好友详情：签名/备注名/备忘/添加时间/共同群聊
  friendsInfo: (friend_id: number) => post<{ friend: FriendInfo }>('friends.info', { friend_id }),
  dmGetOrCreate: (user_id: number) => post<{ id: number; created: number }>('dm.getOrCreate', { user_id }),

  // ==================== 消息 ====================

  messagesSend: (data: {
    group_id: number;
    type?: 'text' | 'image' | 'file' | 'forward';
    content?: string;
    file_id?: number;
    reply_to?: number;
    mentions?: number[];
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

  // 跳转到指定消息：返回该消息前后各 span 条
  messagesAround: (group_id: number, around_id: number, span = 20) =>
    get<{ messages: ChatMessage[]; has_more_before: number }>('messages.around', {
      group_id,
      around_id,
      span,
    }),

  // 查看消息上下文（前后各 5 条）
  messagesContext: (id: number) =>
    get<{ messages: ChatMessage[]; target_id: number; group: { id: number; name: string; is_dm: number } }>(
      'messages.context',
      { id },
    ),

  messagesDelete: (id: number) => post('messages.delete', { id }),

  // 撤回自己的消息（发出 2 分钟内）
  messagesRecall: (id: number) => post('messages.recall', { id }),

  messagesSearch: (keyword: string, group_id = 0, before_id = 0) =>
    get<{ messages: SearchResult[]; has_more: number }>('messages.search', {
      keyword,
      group_id,
      before_id,
    }),

  // status: 0普通 1待办 2已完成；note 传 undefined 表示不修改
  messagesSetTodo: (id: number, status: number, note?: string) =>
    post('messages.setTodo', note === undefined ? { id, status } : { id, status, note }),

  // 待办到点提醒：dueAt 为 null/'' 表示清除
  messagesSetDue: (id: number, dueAt: string | null) =>
    post<{ due_at: string | null }>('messages.setDue', { id, due_at: dueAt }),

  // 日历订阅：独立的订阅 token（与登录凭证分离，可单独重置；粘贴到日历 App「添加订阅日历」）
  eventsIcsToken: () => post<{ token: string }>('events.icsToken'),
  eventsRotateIcs: () => post<{ token: string }>('events.rotateIcs'),
  icsUrlOf: (token: string) => `${API_BASE}/api.php?action=events.ics&token=${encodeURIComponent(token)}`,

  // color: 0无 1红 2橙 3蓝 4灰 5紫 6黄 7绿
  messagesSetColor: (id: number, color: number) =>
    post('messages.setColor', { id, color }),
  // 归档/恢复活跃：kind=todo 待办归档（默认）| important 重要消息归档
  messagesSetArchived: (id: number, archived: number, kind: 'todo' | 'important' = 'todo') =>
    post('messages.setArchived', { id, archived, kind }),
  // 消息备注：scope=private 私有（默认）| public 公共（作者/管理员）
  messagesSetNote: (id: number, note: string, scope: 'private' | 'public' = 'private') =>
    post('messages.setNote', { id, note, scope }),
  // 批量获取私有备注
  messagesGetNotes: (ids: number[]) =>
    post<{ notes: Record<number, string> }>('messages.getNotes', { ids }),

  // 跨群查询所有待办消息
  messagesTodos: () => get<{ messages: CrossGroupMessage[] }>('messages.todos'),

  // 跨群查询所有颜色标记的重要消息
  messagesImportant: () => get<{ messages: CrossGroupMessage[] }>('messages.important'),

  // ==================== 记账 ====================

  // 录入/修改金额：kind 0=清除 1=支出侧 2=收入侧；amount_cents 有符号（单位分，退款/收入调减传负值）
  // amount_date 纯日期 YYYY-MM-DD（补账场景）；不传则后端 fallback 到消息日期或保留原值
  // 权限：私聊双方；群聊仅群主/副群主（普通成员走「委托」）
  messagesSetAmount: (id: number, kind: 0 | 1 | 2, amount_cents?: number, category?: string, amount_date?: string) =>
    post<{ kind: number; amount_cents: number | null; category: string; amount_date: string | null }>(
      'messages.setAmount',
      kind === 0 ? { id, kind } : { id, kind, amount_cents, category: category ?? '', amount_date: amount_date ?? '' },
    ),

  // 分类字典：按群隔离（同一群内共用一套）
  categoriesList: (group_id: number) => get<{ categories: Category[] }>('categories.list', { group_id }),
  categoriesAdd: (group_id: number, kind: 1 | 2, name: string) => post<{ id: number }>('categories.add', { group_id, kind, name }),
  categoriesDelete: (group_id: number, id: number) => post('categories.delete', { group_id, id }),

  // 记账汇总：传 month=YYYY-MM 或 from/to（to 不含边界）；不传则为全部时间
  messagesLedger: (group_id: number, range?: { month?: string; from?: string; to?: string }) => {
    const params: Record<string, string | number> = { group_id };
    if (range?.month) params.month = range.month;
    else {
      if (range?.from) params.from = range.from;
      if (range?.to) params.to = range.to;
    }
    return get<LedgerData>('messages.ledger', params);
  },

  // 记账明细（点击分类/月份下钻）：category 传空串=只看「未分类」；month 或 from/to 限定范围（口径同汇总）
  messagesLedgerDetail: (p: {
    group_id: number;
    kind?: 0 | 1 | 2;
    category?: string;
    user_id?: number; // 按人统计下钻：只看某个人的记录
    month?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) => {
    const params: Record<string, string | number> = { group_id: p.group_id, kind: p.kind ?? 0 };
    if (p.category !== undefined) params.category = p.category;
    if (p.user_id) params.user_id = p.user_id;
    if (p.month) params.month = p.month;
    if (p.from) params.from = p.from;
    if (p.to) params.to = p.to;
    if (p.limit) params.limit = p.limit;
    if (p.offset) params.offset = p.offset;
    return get<LedgerDetail>('messages.ledgerDetail', params);
  },

  // ==================== 已读回执 ====================

  readMark: (group_id: number, msg_id: number) =>
    post('read.mark', { group_id, msg_id }),

  readStatus: (group_id: number) =>
    get<{ readers: ReadState[] }>('read.status', { group_id }),

  // ==================== 文件上传（multipart，XHR 以支持进度；网络层失败时 fetch 兜底） ====================

  async upload(
    file: File | Blob,
    filename: string,
    onProgress?: (percent: number) => void,
  ): Promise<{ file_id: number; url: string; name: string; mime: string; size: number }> {
    // token 走 URL query：景安 WAF 拦截 OPTIONS 预检，不能用自定义请求头
    const token = tokenStore.get();
    const uploadUrl = token
      ? `${API_BASE}/api.php?action=upload&token=${encodeURIComponent(token)}`
      : `${API_BASE}/api.php?action=upload`;

    type UploadData = { file_id: number; url: string; name: string; mime: string; size: number };
    const parseResponse = (status: number, text: string): UploadData => {
      const json = JSON.parse(text);
      if (status === 401) {
        tokenStore.clear();
        unauthorizedHandler?.();
      }
      if (json.ok) return json.data as UploadData;
      throw new ApiError(json.error || '上传失败', status);
    };

    // 首选 XHR：有上传进度。部分安卓 WebView/老 Chrome 的 XHR 无法发送 FormData（瞬间失败、HTTP 0、零进度），
    // 此时自动降级 fetch 重试（无进度），2026-10-16 实测三星机型 fetch 可正常上传
    let successData: UploadData | null = null;
    const xhrErr = await new Promise<ApiError | null>((resolve) => {
      const form = new FormData();
      form.append('file', file, filename);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        try {
          successData = parseResponse(xhr.status, xhr.responseText);
          resolve(null);
        } catch (e) {
          // 业务错误（如文件超限）或响应异常：链路本身是通的，无需 fetch 重试
          resolve(e instanceof ApiError ? e : new ApiError(`上传响应异常（HTTP ${xhr.status}）`, xhr.status));
        }
      };
      xhr.onerror = () => resolve(new ApiError('网络错误', 0));
      xhr.ontimeout = () => resolve(new ApiError('上传超时，请检查网络后重试', 0));
      xhr.timeout = 120000;
      xhr.send(form);
    });

    if (successData) return successData;
    if (!xhrErr) throw new ApiError('上传响应异常', 0); // 理论不可达
    // 服务器明确返回的业务错误（如文件超限）：不重试，直接抛
    if (xhrErr.status !== 0) throw xhrErr;

    // fetch 兜底（XHR 网络层失败时）
    try {
      const form2 = new FormData();
      form2.append('file', file, filename);
      const resp = await fetch(uploadUrl, { method: 'POST', body: form2 });
      return parseResponse(resp.status, await resp.text());
    } catch {
      throw new ApiError('上传失败，网络错误', 0);
    }
  },
};
