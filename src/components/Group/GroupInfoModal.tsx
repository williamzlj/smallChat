import { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, Crown, LogOut, Trash2, Pencil, Check } from 'lucide-react';
import { api } from '../../api/client';
import { Group, GroupMember } from '../../api/types';

interface Props {
  group: Group;
  currentUserId: number;
  onGroupChanged: () => void; // 群列表刷新
  onGroupDeleted: () => void; // 解散/退群后切走会话
  onClose: () => void;
  isDarkMode: boolean;
}

export const GroupInfoModal = ({
  group,
  currentUserId,
  onGroupChanged,
  onGroupDeleted,
  onClose,
  isDarkMode,
}: Props) => {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [inviteName, setInviteName] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteOk, setInviteOk] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(group.name);
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);

  const isOwner = group.owner_id === currentUserId;

  const loadMembers = useCallback(async () => {
    try {
      const { members: list } = await api.groupsMembers(group.id);
      setMembers(list);
    } catch (e) {
      console.warn(e);
    }
  }, [group.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleInvite = async () => {
    const uname = inviteName.trim();
    if (!uname) return;
    setInviteError('');
    setInviteOk('');
    setBusy(true);
    try {
      await api.groupsInvite(group.id, uname);
      setInviteOk(`已把 @${uname} 加入群聊`);
      setInviteName('');
      await loadMembers();
      onGroupChanged();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : '邀请失败');
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameError('群名不能为空');
      return;
    }
    if (trimmed.length > 30) {
      setNameError('群名最长 30 字');
      return;
    }
    setNameError('');
    setBusy(true);
    try {
      await api.groupsRename(group.id, trimmed);
      setEditingName(false);
      onGroupChanged();
    } catch (e) {
      setNameError(e instanceof Error ? e.message : '改名失败');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('确定要退出该群吗？退出后将不再收到此群消息。')) return;
    try {
      await api.groupsLeave(group.id);
      onGroupChanged();
      onGroupDeleted();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : '退群失败');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`确定要解散群「${group.name}」吗？群内所有消息将被删除，且不可恢复！`)) return;
    try {
      await api.groupsDelete(group.id);
      onGroupChanged();
      onGroupDeleted();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : '解散失败');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-5 border-b flex-shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>群聊信息</h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* 群名 */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>群名称</label>
            {editingName && isOwner ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  maxLength={30}
                  autoFocus
                  className={`flex-1 px-3 py-2 text-base border rounded-lg outline-none focus:ring-2 focus:ring-green-500 ${
                    isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
                  }`}
                />
                <button
                  onClick={saveName}
                  disabled={busy}
                  className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className={`text-base ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{group.name}</span>
                {isOwner && (
                  <button
                    onClick={() => {
                      setNameValue(group.name);
                      setEditingName(true);
                    }}
                    className={`flex items-center space-x-1 text-sm px-2 py-1 rounded-lg transition-colors ${
                      isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>改名</span>
                  </button>
                )}
              </div>
            )}
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
          </div>

          {/* 邀请成员 */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              邀请成员 <span className="text-gray-400 font-normal">（输入对方用户名）</span>
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInvite();
                }}
                placeholder="用户名"
                className={`flex-1 px-3 py-2 text-base border rounded-lg outline-none focus:ring-2 focus:ring-green-500 ${
                  isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'
                }`}
              />
              <button
                onClick={handleInvite}
                disabled={busy || !inviteName.trim()}
                className="flex items-center space-x-1 px-3 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50 whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                <span>加入</span>
              </button>
            </div>
            {inviteError && <p className="text-xs text-red-500 mt-1">{inviteError}</p>}
            {inviteOk && <p className="text-xs text-green-600 mt-1">{inviteOk}</p>}
          </div>

          {/* 成员列表 */}
          <div>
            <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              成员（{members.length}）
            </p>
            <div className={`rounded-xl divide-y ${isDarkMode ? 'divide-gray-700 bg-gray-700/40' : 'divide-gray-100 bg-gray-50'}`}>
              {members.map((m) => (
                <div key={m.id} className="flex items-center space-x-3 px-3 py-2.5">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: m.color }}
                  >
                    {m.nickname.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate flex items-center gap-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {m.nickname}
                      {m.id === currentUserId && <span className="text-xs text-gray-400">（我）</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">@{m.username}</p>
                  </div>
                  {m.is_owner === 1 && (
                    <span className="flex items-center text-xs text-amber-500 flex-shrink-0">
                      <Crown className="w-3.5 h-3.5 mr-0.5" />
                      群主
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 危险操作 */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {isOwner ? (
              <button
                onClick={handleDelete}
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>解散群聊</span>
              </button>
            ) : (
              <button
                onClick={handleLeave}
                className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>退出群聊</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
