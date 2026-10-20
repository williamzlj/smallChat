import { useEffect, useState } from 'react';
import { Menu, X, MessageCircle, Trash2, Pencil, Check, Users, ArrowLeft } from 'lucide-react';
import { Friend, FriendInfo } from '../api/types';
import { api } from '../api/client';
import { Avatar } from './Avatar';

interface Props {
  friend: Friend;
  isDarkMode: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSendMessage: (f: Friend) => void;
  onRemove: (f: Friend) => void;
  onJumpGroup: (groupId: number) => void;
  onUpdated: (friendId: number, patch: { alias?: string; memo?: string }) => void;
  onBack?: () => void; // 返回上一级（聊天界面或好友列表）
}

// 好友详情页（微信同款）：签名 / 备注名 / 备忘信息 / 共同群聊 / 添加时间
export const FriendDetail = ({
  friend,
  isDarkMode,
  sidebarOpen,
  onToggleSidebar,
  onSendMessage,
  onRemove,
  onJumpGroup,
  onUpdated,
  onBack,
}: Props) => {
  const [info, setInfo] = useState<FriendInfo | null>(null);
  const [editingField, setEditingField] = useState<'alias' | 'memo' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setInfo(null);
    setEditingField(null);
    api
      .friendsInfo(friend.id)
      .then((r) => setInfo(r.friend))
      .catch(() => setInfo(null));
  }, [friend.id]);

  const startEdit = (field: 'alias' | 'memo') => {
    setEditingField(field);
    setEditValue(field === 'alias' ? friend.alias || '' : friend.memo || '');
  };

  const saveEdit = async () => {
    if (!editingField) return;
    const value = editValue.trim();
    setSaving(true);
    try {
      await api.friendsUpdate(friend.id, { [editingField]: value });
      onUpdated(friend.id, { [editingField]: value });
      if (info) setInfo({ ...info, [editingField]: value });
      setEditingField(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败');
    }
    setSaving(false);
  };

  const displayName = friend.alias || friend.nickname;
  const inputCls = `w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-green-500 ${
    isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'
  }`;
  const rowCls = `px-4 sm:px-6 py-4 flex items-start space-x-3 ${
    isDarkMode ? 'border-gray-700' : 'border-gray-100'
  } border-b`;
  const labelCls = 'w-20 flex-shrink-0 text-sm text-gray-400 pt-0.5';
  const valueCls = `flex-1 min-w-0 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`;

  return (
    <>
      <div
        className={`border-b px-2 sm:px-4 py-2.5 flex items-center flex-shrink-0 ${
          isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        }`}
      >
        {onBack && (
          <button
            onClick={onBack}
            className={`p-1.5 rounded-lg flex-shrink-0 mr-1 ${
              isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="返回"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onToggleSidebar}
          className={`p-1.5 rounded-lg lg:hidden flex-shrink-0 ${
            isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <h2 className={`text-base font-semibold ml-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>好友详情</h2>
      </div>

      <div className={`flex-1 overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="max-w-lg mx-auto py-6 px-4">
          {/* 头像 + 名字区 */}
          <div
            className={`rounded-2xl p-6 flex items-center space-x-4 ${
              isDarkMode ? 'bg-gray-800' : 'bg-white shadow-sm'
            }`}
          >
            <Avatar
              userId={friend.id}
              nickname={friend.nickname}
              color={friend.color}
              avatarVer={friend.avatar_ver}
              size={72}
              className="rounded-2xl"
            />
            <div className="flex-1 min-w-0">
              <p className={`text-xl font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                {displayName}
              </p>
              <p className="text-sm text-gray-400 truncate mt-0.5">
                昵称：{friend.nickname}
              </p>
              <p className="text-sm text-gray-400 truncate">账号：@{friend.username}</p>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center space-x-3 mt-4">
            <button
              onClick={() => onSendMessage(friend)}
              className="flex-1 flex items-center justify-center space-x-2 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 shadow-md text-sm font-medium"
            >
              <MessageCircle className="w-4 h-4" />
              <span>发消息</span>
            </button>
            <button
              onClick={() => onRemove(friend)}
              className={`flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-medium ${
                isDarkMode ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>删除好友</span>
            </button>
          </div>

          {/* 详细信息 */}
          <div className={`rounded-2xl mt-4 overflow-hidden ${isDarkMode ? 'bg-gray-800' : 'bg-white shadow-sm'}`}>
            {/* 签名 */}
            <div className={rowCls}>
              <span className={labelCls}>签名</span>
              <p className={`${valueCls} whitespace-pre-wrap break-words`}>
                {info?.signature ? info.signature : <span className="text-gray-400">对方还没有签名</span>}
              </p>
            </div>

            {/* 备注名 */}
            <div className={rowCls}>
              <span className={labelCls}>备注名</span>
              {editingField === 'alias' ? (
                <div className="flex-1 min-w-0 flex items-center space-x-2">
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value.slice(0, 20))}
                    maxLength={20}
                    autoFocus
                    placeholder="输入备注名，留空清除"
                    className={inputCls}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveEdit();
                      if (e.key === 'Escape') setEditingField(null);
                    }}
                  />
                  <button
                    onClick={() => void saveEdit()}
                    disabled={saving}
                    className="p-2 rounded-lg bg-green-500 text-white hover:bg-green-600 flex-shrink-0 disabled:opacity-40"
                    title="保存"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingField(null)}
                    className={`p-2 rounded-lg flex-shrink-0 ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
                    title="取消"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <p className={valueCls}>
                    {friend.alias ? friend.alias : <span className="text-gray-400">未设置</span>}
                  </p>
                  <button
                    onClick={() => startEdit('alias')}
                    className={`p-1.5 rounded-lg flex-shrink-0 ${isDarkMode ? 'text-gray-500 hover:text-green-400 hover:bg-gray-700' : 'text-gray-400 hover:text-green-600 hover:bg-gray-100'}`}
                    title="设置备注名（仅自己可见）"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* 备忘信息 */}
            <div className={rowCls}>
              <span className={labelCls}>备忘</span>
              {editingField === 'memo' ? (
                <div className="flex-1 min-w-0 space-y-2">
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value.slice(0, 500))}
                    rows={4}
                    autoFocus
                    placeholder="记录一些只有你能看到的信息，比如怎么认识的、要注意的事…"
                    className={`${inputCls} resize-none`}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{editValue.length}/500，仅自己可见</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setEditingField(null)}
                        className={`px-3 py-1.5 text-xs rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
                      >
                        取消
                      </button>
                      <button
                        onClick={() => void saveEdit()}
                        disabled={saving}
                        className="px-3 py-1.5 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-40"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className={`${valueCls} whitespace-pre-wrap break-words`}>
                    {friend.memo ? friend.memo : <span className="text-gray-400">未设置</span>}
                  </p>
                  <button
                    onClick={() => startEdit('memo')}
                    className={`p-1.5 rounded-lg flex-shrink-0 ${isDarkMode ? 'text-gray-500 hover:text-green-400 hover:bg-gray-700' : 'text-gray-400 hover:text-green-600 hover:bg-gray-100'}`}
                    title="设置备忘信息（仅自己可见）"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>

            {/* 共同群聊 */}
            <div className={rowCls}>
              <span className={labelCls}>共同群聊</span>
              <div className="flex-1 min-w-0">
                {info === null ? (
                  <p className="text-sm text-gray-400">加载中…</p>
                ) : info.common_groups.length === 0 ? (
                  <p className="text-sm text-gray-400">没有共同群聊</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {info.common_groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => onJumpGroup(g.id)}
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                          isDarkMode
                            ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-700 hover:bg-green-50 hover:text-green-700'
                        }`}
                        title="打开该群聊"
                      >
                        <Users className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate max-w-[10rem]">{g.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 添加时间 */}
            <div className={`${rowCls} border-b-0`}>
              <span className={labelCls}>添加时间</span>
              <p className={valueCls}>{(info?.created_at || friend.created_at || '').slice(0, 16) || '—'}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
