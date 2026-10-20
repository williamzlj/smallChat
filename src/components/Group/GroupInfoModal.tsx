import { useState, useEffect, useCallback, useRef, type ComponentType } from 'react';
import { X, Crown, Shield, LogOut, Trash2, Pencil, Check, User, UserMinus, UserCog, Eye, Archive, ArchiveRestore, CopyPlus, Download, Loader2, Megaphone, FileText, Tag, Wallet } from 'lucide-react';
import { api } from '../../api/client';
import { Group, GroupMember, GroupRole, Friend, ChatMessage } from '../../api/types';

// 角色管理选项（groups.setRole：0=普通成员 1=副群主 2=观察者）
const ROLE_OPTS: { role: 0 | 1 | 2; key: GroupRole; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { role: 1, key: 'admin', label: '设为副群主', Icon: Shield },
  { role: 0, key: 'member', label: '设为普通成员', Icon: User },
  { role: 2, key: 'observer', label: '设为观察者', Icon: Eye },
];

// 成员角色：优先用 role 字段，缺失时按 is_owner/is_admin 兜底
const memberRole = (m: GroupMember): GroupRole =>
  m.role || (m.is_owner === 1 ? 'owner' : m.is_admin === 1 ? 'admin' : 'member');

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
  const [friends, setFriends] = useState<Friend[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [inviteMsg, setInviteMsg] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(group.name);
  const [nameError, setNameError] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  // 群公告 / 群说明 / 群备注
  const [editingNotice, setEditingNotice] = useState(false);
  const [noticeValue, setNoticeValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [noticeError, setNoticeError] = useState('');
  const [remarkEditing, setRemarkEditing] = useState(false);
  const [remarkValue, setRemarkValue] = useState('');
  // 群主的角色管理下拉（记录打开的成员 id）+ 操作结果轻提示
  const [roleMenuFor, setRoleMenuFor] = useState<number | null>(null);
  const [roleMsg, setRoleMsg] = useState('');
  const [ledgerMsg, setLedgerMsg] = useState('');
  const roleMenuRef = useRef<HTMLDivElement>(null);

  // 财务记账开关（按群开启，默认关闭）：只有群主/副群主可切换
  const toggleLedger = async () => {
    const next = group.ledger_enabled !== 1;
    setBusy(true);
    try {
      await api.groupsSetLedger(group.id, next);
      onGroupChanged();
      setLedgerMsg(next ? '已开启财务记账' : '已关闭财务记账');
      setTimeout(() => setLedgerMsg(''), 2000);
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const isOwner = group.owner_id === currentUserId;
  const isDm = group.is_dm === 1;
  // 当前用户在本群的有效角色（my_role 优先，缺失时兜底推算）
  const myRole: GroupRole =
    group.my_role || (isOwner ? 'owner' : members.some((m) => m.id === currentUserId && m.is_admin === 1) ? 'admin' : 'member');
  // 当前用户是否为群主或副群主（管理能力：改名/公告/邀请/停用/移出等）
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  // 普通成员/观察者不能邀请成员
  const inviteBlocked = myRole === 'member' || myRole === 'observer';

  // 角色下拉：点击外部关闭
  useEffect(() => {
    if (roleMenuFor === null) return;
    const onDown = (e: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setRoleMenuFor(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [roleMenuFor]);

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
    api.friendsList()
      .then((r) => setFriends(r.friends))
      .catch(() => {});
  }, [loadMembers]);

  // 不在本群的好友可邀请
  const candidates = friends.filter((f) => !members.some((m) => m.id === f.id));

  const togglePick = (id: number) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleAddPicked = async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    setInviteMsg('');
    const errs: string[] = [];
    for (const f of candidates.filter((c) => picked.includes(c.id))) {
      try {
        await api.groupsInvite(group.id, f.username);
      } catch (e) {
        errs.push(`${f.nickname}: ${e instanceof Error ? e.message : '失败'}`);
      }
    }
    setPicked([]);
    await loadMembers();
    onGroupChanged();
    setInviteMsg(errs.length > 0 ? errs.join('；') : '已添加所选好友');
    setBusy(false);
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

  // 保存群公告 / 群说明
  const saveNotice = async () => {
    setNoticeError('');
    setBusy(true);
    try {
      await api.groupsSetNotice(group.id, noticeValue.trim(), descValue.trim());
      setEditingNotice(false);
      onGroupChanged();
    } catch (e) {
      setNoticeError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  // 保存群备注（仅自己可见）
  const saveRemark = async () => {
    setBusy(true);
    try {
      await api.groupsSetRemark(group.id, remarkValue.trim());
      setRemarkEditing(false);
      onGroupChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async (m: GroupMember) => {
    setRoleMenuFor(null); // 从成员操作菜单触发时先收起菜单
    if (!confirm(`确定把「${m.nickname}」移出群聊吗？`)) return;
    try {
      await api.groupsKick(group.id, m.id);
      await loadMembers();
      onGroupChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : '移出失败');
    }
  };

  const handleTransfer = async (m: GroupMember) => {
    setRoleMenuFor(null); // 从成员操作菜单触发时先收起菜单
    if (!confirm(`确定把群主转让给「${m.nickname}」吗？转让后你将成为普通成员。`)) return;
    try {
      await api.groupsTransfer(group.id, m.id);
      await loadMembers();
      onGroupChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : '转让失败');
    }
  };

  const handleSetRole = async (m: GroupMember, role: 0 | 1 | 2, label: string) => {
    setRoleMenuFor(null);
    if (!confirm(`确定把「${m.nickname}」设为${label}吗？`)) return;
    try {
      await api.groupsSetRole(group.id, m.id, role);
      await loadMembers();
      onGroupChanged();
      setRoleMsg(`已将「${m.nickname}」设为${label}`);
      setTimeout(() => setRoleMsg(''), 2000);
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleArchive = async () => {
    const archiving = group.is_archived !== 1;
    if (
      !confirm(
        archiving
          ? `确定停用群「${group.name}」吗？停用后所有人都不能发言，相当于归档。`
          : `确定恢复群「${group.name}」吗？恢复后可正常发言。`,
      )
    )
      return;
    try {
      await api.groupsArchive(group.id, archiving);
      onGroupChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleClone = async () => {
    const name = window.prompt('复制成员名单创建新群（不复制消息），请输入新群名称：', `${group.name}（副本）`);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await api.groupsClone(group.id, trimmed);
      onGroupChanged();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : '复制失败');
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportMsg('');
    try {
      // history 接口 before_id=0 返回最新一条，用它拿到最新消息 id
      // （messages.list 按 id 升序取 limit=1 会返回最旧一条，导致此前导出只有 1 条）
      const { messages: latest } = await api.messagesHistory(group.id, 0, 1);
      const all: ChatMessage[] = [];
      if (latest.length > 0) {
        let before = latest[0].id + 1;
        for (;;) {
          const { messages: batch, has_more } = await api.messagesHistory(group.id, before, 200);
          if (batch.length === 0) break;
          all.unshift(...batch);
          before = batch[0].id;
          if (!has_more) break;
        }
      }
      const lines = all.map((m) => {
        const body =
          m.deleted === 1
            ? '[已删除]'
            : m.type === 'text'
              ? m.content
              : m.type === 'image'
                ? '[图片]'
                : m.type === 'file'
                  ? `[文件] ${m.content}`
                  : '[聊天记录]';
        return `[${m.created_at}] ${m.nickname}: ${body}`;
      });
      const title = isDm && group.dm_peer ? `与 ${group.dm_peer.nickname} 的私聊` : `群「${group.name}」`;
      const now = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const header = `# ${title} 聊天记录\n# 导出时间: ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}\n# 共 ${lines.length} 条\n\n`;
      const blob = new Blob([header + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const safeName = (isDm && group.dm_peer ? group.dm_peer.nickname : group.name).replace(/[\\/:*?"<>|]/g, '_');
      a.download = `${safeName}-聊天记录-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExportMsg(`已导出 ${lines.length} 条消息`);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : '导出失败');
    } finally {
      setExporting(false);
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
          <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
            {isDm ? '私聊信息' : '群聊信息'}
          </h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* 群名（私聊不可改） */}
          {!isDm && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>群名称</label>
              {editingName && isAdmin ? (
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
                  {isAdmin && (
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
              {nameError && <p className="text-sm text-red-500 mt-1">{nameError}</p>}
            </div>
          )}

          {/* 群公告 / 群说明（管理员编辑，全员可见，私聊隐藏） */}
          {!isDm && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>群公告 / 群说明</label>
                {isAdmin && !editingNotice && (
                  <button
                    onClick={() => {
                      setNoticeValue(group.announcement || '');
                      setDescValue(group.description || '');
                      setNoticeError('');
                      setEditingNotice(true);
                    }}
                    className={`flex items-center space-x-1 text-sm px-2 py-1 rounded-lg transition-colors ${
                      isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>编辑</span>
                  </button>
                )}
              </div>
              {editingNotice ? (
                <div className="space-y-2">
                  <textarea
                    value={noticeValue}
                    onChange={(e) => setNoticeValue(e.target.value)}
                    maxLength={500}
                    rows={3}
                    autoFocus
                    placeholder="群公告（500 字内）"
                    className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-green-500 resize-none ${
                      isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300'
                    }`}
                  />
                  <textarea
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="群说明（500 字内）"
                    className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-green-500 resize-none ${
                      isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300'
                    }`}
                  />
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={saveNotice}
                      disabled={busy}
                      className="flex-1 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingNotice(false)}
                      className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                        isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      取消
                    </button>
                  </div>
                  {noticeError && <p className="text-sm text-red-500">{noticeError}</p>}
                </div>
              ) : (
                <div className={`space-y-1.5 rounded-xl p-3 ${isDarkMode ? 'bg-gray-700/40' : 'bg-gray-50'}`}>
                  <p className={`flex items-start gap-1.5 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    <Megaphone className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                    <span className="whitespace-pre-wrap break-words">{group.announcement || '暂无群公告'}</span>
                  </p>
                  <p className={`flex items-start gap-1.5 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    <FileText className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                    <span className="whitespace-pre-wrap break-words">{group.description || '暂无群说明'}</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 财务记账（按群开启，默认关闭；群主/副群主可切换，私聊不显示） */}
          {!isDm && (
            <div>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className={`flex items-center gap-1.5 text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    <Wallet className="w-4 h-4 text-rose-500" />
                    财务记账
                  </p>
                  <p className={`mt-0.5 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {group.ledger_enabled === 1
                      ? '已开启：可在本群给消息记金额，并按月汇总开支'
                      : '未开启：本群不会出现记账入口（只在需要记账的群开启即可）'}
                  </p>
                  {!isAdmin && (
                    <p className={`mt-0.5 text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>只有群主或副群主可以修改</p>
                  )}
                </div>
                <button
                  onClick={() => void toggleLedger()}
                  disabled={!isAdmin || busy}
                  title={isAdmin ? (group.ledger_enabled === 1 ? '点击关闭财务记账' : '点击开启财务记账') : '只有群主或副群主可以修改'}
                  className={`flex-shrink-0 ml-3 w-12 h-7 rounded-full relative transition-colors ${
                    group.ledger_enabled === 1 ? 'bg-green-500' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
                  } ${!isAdmin || busy ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${
                      group.ledger_enabled === 1 ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
              {ledgerMsg && <p className="text-sm text-green-600 mt-1">{ledgerMsg}</p>}
            </div>
          )}

          {/* 群备注（仅自己可见） */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              群备注 <span className="text-gray-400 font-normal">（仅自己可见）</span>
            </label>
            {remarkEditing ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={remarkValue}
                  onChange={(e) => setRemarkValue(e.target.value)}
                  maxLength={30}
                  autoFocus
                  placeholder="最多 30 字，留空则清除"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveRemark();
                    if (e.key === 'Escape') setRemarkEditing(false);
                  }}
                  className={`flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-green-500 ${
                    isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300'
                  }`}
                />
                <button
                  onClick={saveRemark}
                  disabled={busy}
                  className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className={`flex items-center gap-1.5 text-sm ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <Tag className="w-3.5 h-3.5 text-gray-400" />
                  {group.remark || '未设置'}
                </span>
                <button
                  onClick={() => {
                    setRemarkValue(group.remark || '');
                    setRemarkEditing(true);
                  }}
                  className={`flex items-center space-x-1 text-sm px-2 py-1 rounded-lg transition-colors ${
                    isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>{group.remark ? '修改' : '设置'}</span>
                </button>
              </div>
            )}
          </div>

          {/* 从好友列表邀请成员（私聊隐藏；普通成员/观察者禁用） */}
          {!isDm && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                邀请成员 <span className="text-gray-400 font-normal">（从好友列表选择）</span>
              </label>
              {inviteBlocked && (
                <p className="mb-2 text-sm text-amber-500">普通用户不能邀请成员，请委托群主或副群主邀请</p>
              )}
              {candidates.length === 0 ? (
                <p className="text-xs text-gray-400">
                  {friends.length === 0 ? '暂无好友，可先在左侧「好友」页添加' : '所有好友都已在本群'}
                </p>
              ) : (
                <>
                  <div className={`rounded-xl divide-y max-h-44 overflow-y-auto ${inviteBlocked ? 'opacity-50 pointer-events-none' : ''} ${isDarkMode ? 'divide-gray-700 bg-gray-700/40' : 'divide-gray-100 bg-gray-50'}`}>
                    {candidates.map((f) => {
                      const on = picked.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => togglePick(f.id)}
                          className={`w-full flex items-center space-x-3 px-3 py-2 text-left transition-colors ${
                            isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              on ? 'bg-green-500 border-green-500 text-white' : isDarkMode ? 'border-gray-500' : 'border-gray-300'
                            }`}
                          >
                            {on && <Check className="w-3 h-3" />}
                          </span>
                          <span
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: f.color }}
                          >
                            {f.nickname.slice(0, 1).toUpperCase()}
                          </span>
                          <span className={`text-sm truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{f.nickname}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={handleAddPicked}
                    disabled={busy || picked.length === 0 || inviteBlocked}
                    className="mt-2 w-full py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    添加所选（{picked.length}）
                  </button>
                </>
              )}
              {inviteMsg && <p className="text-sm text-green-600 mt-1">{inviteMsg}</p>}
            </div>
          )}

          {/* 成员列表 */}
          <div>
            <p className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              成员（{members.length}）
            </p>
            <div className={`rounded-xl divide-y ${isDarkMode ? 'divide-gray-700 bg-gray-700/40' : 'divide-gray-100 bg-gray-50'}`}>
              {members.map((m) => {
                const role = memberRole(m);
                return (
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
                    {/* 角色徽章：普通成员不显示，保持简洁 */}
                    {role === 'owner' && (
                      <span className="flex items-center text-sm text-amber-500 flex-shrink-0">
                        <Crown className="w-3.5 h-3.5 mr-0.5" />
                        群主
                      </span>
                    )}
                    {role === 'admin' && (
                      <span className="flex items-center text-sm text-blue-500 flex-shrink-0">
                        <Shield className="w-3.5 h-3.5 mr-0.5" />
                        副群主
                      </span>
                    )}
                    {role === 'observer' && (
                      <span className="flex items-center text-sm text-gray-400 flex-shrink-0" title="观察者仅可查看，不能发言">
                        <Eye className="w-3.5 h-3.5 mr-0.5" />
                        观察者
                      </span>
                    )}
                    {/* 成员操作菜单：设置角色/转让群/移出群合并为一个入口，各项按权限显示（与原独立按钮规则一致） */}
                    {!isDm &&
                      m.id !== currentUserId &&
                      (() => {
                        // 各项显示权限与现状完全一致：
                        // 设置角色=仅群主且目标非群主；转让群=仅群主；移出群=群主/副群主，副群主不能移出副群主
                        const canSetRole = isOwner && role !== 'owner';
                        const canTransfer = isOwner;
                        const canKick = isAdmin && !(myRole === 'admin' && role === 'admin');
                        if (!canSetRole && !canTransfer && !canKick) return null;
                        return (
                          <div className="relative flex-shrink-0" ref={roleMenuFor === m.id ? roleMenuRef : undefined}>
                            <button
                              onClick={() => setRoleMenuFor(roleMenuFor === m.id ? null : m.id)}
                              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:text-blue-400 hover:bg-gray-700' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
                              title="成员操作"
                            >
                              <UserCog className="w-4 h-4" />
                            </button>
                            {roleMenuFor === m.id && (
                              <div
                                className={`absolute right-0 top-full mt-1 w-40 rounded-xl shadow-xl border py-1 z-20 ${
                                  isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                                }`}
                              >
                                {canSetRole &&
                                  ROLE_OPTS.map((o) => (
                                    <button
                                      key={o.key}
                                      disabled={role === o.key}
                                      onClick={() => handleSetRole(m, o.role, o.label.replace('设为', ''))}
                                      className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors disabled:opacity-50 disabled:cursor-default ${
                                        isDarkMode ? 'text-gray-200 hover:bg-gray-600' : 'text-gray-700 hover:bg-gray-100'
                                      }`}
                                    >
                                      <o.Icon className="w-4 h-4 mr-2 text-gray-400" />
                                      <span className="flex-1">{o.label}</span>
                                      {role === o.key && <Check className="w-4 h-4 text-green-500" />}
                                    </button>
                                  ))}
                                {canSetRole && (canTransfer || canKick) && (
                                  <div className={`my-1 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`} />
                                )}
                                {canTransfer && (
                                  <button
                                    onClick={() => handleTransfer(m)}
                                    className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors ${
                                      isDarkMode ? 'text-amber-400 hover:bg-gray-600' : 'text-amber-600 hover:bg-amber-50'
                                    }`}
                                  >
                                    <Crown className="w-4 h-4 mr-2" />
                                    <span className="flex-1">转让群</span>
                                  </button>
                                )}
                                {canKick && (
                                  <button
                                    onClick={() => handleKick(m)}
                                    className={`w-full flex items-center px-3 py-2 text-sm text-left transition-colors ${
                                      isDarkMode ? 'text-red-400 hover:bg-gray-600' : 'text-red-600 hover:bg-red-50'
                                    }`}
                                  >
                                    <UserMinus className="w-4 h-4 mr-2" />
                                    <span className="flex-1">移出群</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                  </div>
                );
              })}
            </div>
            {roleMsg && <p className="text-sm text-green-600 mt-1">{roleMsg}</p>}
          </div>

          {/* 导出聊天记录 */}
          <div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className={`w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isDarkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              } disabled:opacity-60`}
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{exporting ? '正在导出…' : '导出聊天记录（txt）'}</span>
            </button>
            {exportMsg && <p className="text-sm text-green-600 mt-1 text-center">{exportMsg}</p>}
          </div>

          {/* 其他操作 */}
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {!isDm && (
              <button
                onClick={handleClone}
                className={`w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isDarkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <CopyPlus className="w-4 h-4" />
                <span>复制群聊（仅成员名单，开启新话题）</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={handleArchive}
                className={`w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  group.is_archived === 1
                    ? 'bg-green-50 text-green-600 hover:bg-green-100'
                    : isDarkMode
                      ? 'bg-gray-700 text-amber-400 hover:bg-gray-600'
                      : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                }`}
              >
                {group.is_archived === 1 ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                <span>{group.is_archived === 1 ? '恢复群聊' : '停用群聊（归档）'}</span>
              </button>
            )}
            {!isDm &&
              (isOwner ? (
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
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
