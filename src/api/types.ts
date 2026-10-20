// 与后端 api.php 数据结构对齐的类型定义

// 群内角色：owner=群主 admin=副群主 member=普通成员 observer=观察者（只读）
export type GroupRole = 'owner' | 'admin' | 'member' | 'observer';

export interface User {
  id: number;
  username: string;
  nickname: string;
  color: string;
  avatar_ver: number; // 头像版本号，0=未设置头像；变化时才需重新拉取头像数据
  signature: string; // 用户签名（500 字以内）
  card_signature: string; // 分享卡片署名（20 字以内，留空则卡片不显示署名）
}

export interface Group {
  id: number;
  name: string;
  owner_id: number;
  my_role: GroupRole; // 本人在该群的有效角色（私聊 DM 恒为 member）
  is_dm: number; // 1=私聊会话（复用群机制）
  is_archived: number; // 1=已停用归档，不能发消息
  pinned_msg_id: number; // 0=无置顶
  announcement: string; // 群公告（管理员编辑，全员可见）
  description: string; // 群说明（管理员编辑，全员可见）
  remark: string; // 群备注（当前用户自己的私有备注）
  ledger_enabled: number; // 1=该会话已开启财务记账（私聊恒为 1；群聊默认 0，未开启时不显示记账入口）
  pinned_chat: number; // 会话置顶（当前用户自己，0普通 1普通置顶 2超级置顶，多设备同步）
  member_count: number;
  last_msg_id: number;
  last_read_msg_id: number; // 当前用户在该群的已读位置
  unread_count: number; // 未读消息数（他人发送）
  dm_peer: User | null; // 私聊对方信息（is_dm=1 时非空）
  created_at: string;
}

export interface GroupMember extends User {
  is_owner: number; // 1=群主（兼容保留，优先用 role）
  is_admin: number; // 1=副群主（兼容保留，优先用 role）
  role: GroupRole; // 群内角色
  joined_at: string;
}

export interface Friend extends User {
  created_at: string; // 加好友时间
  alias: string; // 我给好友设置的备注名（仅本人可见）
  memo: string; // 我给好友设置的备忘信息（仅本人可见）
}

// 好友详情（friends.info 返回）
export interface FriendInfo extends Friend {
  common_groups: { id: number; name: string }[]; // 共同群聊（不含私聊）
}

export interface FileInfo {
  id: number;
  url: string; // 相对路径 uploads/xxx
  name: string;
  mime: string;
  size: number;
}

export type MessageType = 'text' | 'image' | 'file' | 'forward';

// 引用消息的摘要
export interface ReplySummary {
  id: number;
  nickname: string;
  type: MessageType;
  content: string; // 截断 80 字
  deleted: number;
}

// 合并转发单条内容（forward 消息 content JSON 的 items 元素）
export interface ForwardItem {
  nickname: string;
  color: string;
  type: MessageType;
  content: string;
  file: FileInfo | null;
  created_at: string;
}

export interface ForwardPayload {
  title: string;
  items: ForwardItem[];
}

export interface ChatMessage {
  id: number;
  group_id: number;
  user_id: number;
  nickname: string;
  color: string;
  avatar_ver: number; // 发送者头像版本号
  type: MessageType;
  content: string;
  file: FileInfo | null;
  is_todo: number;
  todo_status: number; // 0=普通 1=待办 2=已完成
  todo_note: string | null;
  todo_archived: number; // 待办归档（0=活跃 1=已归档，独立于完成状态）
  important_archived: number; // 重要消息归档（0=活跃 1=已归档，独立于待办归档）
  due_at: string | null; // 待办到点提醒（仅 todo_status=1 有效，null=未设置）
  note: string; // 公共备注（全员可见，作者/管理员可编辑）
  reply_to: number;
  reply: ReplySummary | null;
  mentions: number[]; // 被 @ 的用户 id
  edited_at: string | null;
  deleted: number; // 1=已删除（软删除）
  recalled: number; // 1=作者本人在 2 分钟内主动撤回（显示「xxx 撤回了一条消息」）
  color_mark: number; // 0无 1红（危险留意）2橙（积极力量）3蓝（业务流程）4灰（高于普通关注）5紫（想法创意）6黄（关心的事）7绿（读书笔记）
  amount_kind: number; // 记账类型：0=非记账 1=支出侧 2=收入侧
  amount_cents: number | null; // 记账金额（有符号，单位分）：支出侧 正=支出/负=退款；收入侧 正=收入/负=收入调减
  amount_cat: string; // 记账分类名（空=未分类）
  amount_date: string | null; // 记账日期（纯日期 YYYY-MM-DD；补账场景≠消息日期；空=fallback 到消息日期）
  created_at: string; // 后端时间字符串 Y-m-d H:i:s
  // 仅本地使用的发送状态
  status?: 'sending' | 'failed';
  clientTempId?: string;
}

// 跨群查询返回的消息（附带群名等信息）
export interface CrossGroupMessage extends ChatMessage {
  group_name: string;
  is_dm: number;
  my_note?: string; // 我的备注（仅本人可见，待办/重要面板接口返回）
}

export interface TokenInfo {
  token: string;
  device_name: string;
  created_at: string;
  expires_at: string;
  is_current: number;
}

// 搜索结果项
export interface SearchResult {
  id: number;
  group_id: number;
  group_name: string;
  is_dm: number;
  user_id: number;
  nickname: string;
  color: string;
  content: string;
  created_at: string;
}

// 群成员已读状态
export interface ReadState {
  user_id: number;
  nickname: string;
  color: string;
  last_read_msg_id: number;
}

// ==================== 记账 ====================

// 录入类型（对应 (kind,符号) 两维组合）：支出/退款属支出侧，收入/收入调减属收入侧
export type AmountType = 'expense' | 'refund' | 'income' | 'incomeRev';

export interface Category {
  id: number;
  kind: 1 | 2; // 1=支出侧 2=收入侧
  name: string;
  sort: number;
}

export interface LedgerTotals {
  expense: number; // 支出侧合计（分，退款已抵减，可能为负）
  income: number; // 收入侧合计（分，收入调减已抵减）
  net: number; // 结余 = 收入 - 支出
  count: number;
}

export interface LedgerCategoryRow {
  kind: number; // 1=支出侧 2=收入侧
  category: string;
  total: number; // 分（带符号）
  count: number;
}

export interface LedgerUserRow {
  user_id: number;
  nickname: string;
  kind: number;
  total: number; // 分（带符号）
  count: number;
}

export interface LedgerMonthRow {
  month: string; // YYYY-MM
  expense: number;
  income: number;
  net: number;
  count: number;
}

export interface LedgerData {
  range: { from: string; to: string };
  totals: LedgerTotals;
  by_category: LedgerCategoryRow[];
  by_user: LedgerUserRow[];
  by_month: LedgerMonthRow[];
}

// 明细单条（messages.ledgerDetail）：构成某笔合计的一条记账消息
export interface LedgerDetailRow {
  id: number; // 消息 id（点击可跳转到聊天里的该条消息）
  user_id: number;
  nickname: string;
  type: MessageType;
  content: string; // 文本摘要（图片/文件/转发由前端按 type 显示占位文案）
  amount_cents: number; // 有符号分
  amount_kind: number; // 1=支出侧 2=收入侧
  amount_cat: string;
  ledger_date: string; // 有效记账日 YYYY-MM-DD
  created_at: string; // 消息发送时间 Y-m-d H:i:s
}

export interface LedgerDetail {
  count: number;
  total: number; // 该条件下的合计（有符号分）
  has_more: number; // 1=还有更多（配合 offset 分页）
  rows: LedgerDetailRow[];
}
