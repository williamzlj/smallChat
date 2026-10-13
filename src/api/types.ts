// 与后端 api.php 数据结构对齐的类型定义

export interface User {
  id: number;
  username: string;
  nickname: string;
  color: string;
}

export interface Group {
  id: number;
  name: string;
  owner_id: number;
  member_count: number;
  last_msg_id: number;
  created_at: string;
}

export interface GroupMember extends User {
  is_owner: number; // 1=群主
  joined_at: string;
}

export interface FileInfo {
  id: number;
  url: string; // 相对路径 uploads/xxx
  name: string;
  mime: string;
  size: number;
}

export type MessageType = 'text' | 'image' | 'file';

export interface ChatMessage {
  id: number;
  group_id: number;
  user_id: number;
  nickname: string;
  color: string;
  type: MessageType;
  content: string;
  file: FileInfo | null;
  is_todo: number;
  deleted: number; // 1=已删除（软删除）
  created_at: string; // 后端时间字符串 Y-m-d H:i:s
  // 仅本地使用的发送状态
  status?: 'sending' | 'failed';
  clientTempId?: string;
}

export interface TokenInfo {
  token: string;
  device_name: string;
  created_at: string;
  expires_at: string;
  is_current: number;
}
