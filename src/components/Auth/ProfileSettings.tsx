import { useState, useEffect } from 'react';
import { X, LogOut, Minus, Plus, Monitor, Trash2, Check } from 'lucide-react';
import { User, TokenInfo } from '../../api/types';
import { api } from '../../api/client';
import { AuthResult } from '../../hooks/useAuth';

interface Props {
  user: User;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onUpdate: (data: {
    nickname?: string;
    color?: string;
    oldPassword?: string;
    newPassword?: string;
  }) => Promise<AuthResult>;
  onLogout: () => void;
  onClose: () => void;
}

const COLORS = [
  '#0FDC78', '#3B82F6', '#F59E0B', '#EC4899',
  '#8B5CF6', '#14B8A6', '#F97316', '#EF4444',
];

export const ProfileSettings = ({
  user,
  fontSize,
  onFontSizeChange,
  onUpdate,
  onLogout,
  onClose,
}: Props) => {
  const [nickname, setNickname] = useState(user.nickname);
  const [color, setColor] = useState(user.color);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);

  useEffect(() => {
    api
      .tokensList()
      .then(({ tokens: list }) => setTokens(list))
      .catch(() => undefined);
  }, []);

  const profileChanged = nickname.trim() !== user.nickname || color !== user.color;

  const saveProfile = async () => {
    setError('');
    setSuccess('');
    if (!nickname.trim()) {
      setError('昵称不能为空');
      return;
    }
    setBusy(true);
    const r = await onUpdate({
      nickname: nickname.trim() !== user.nickname ? nickname.trim() : undefined,
      color: color !== user.color ? color : undefined,
    });
    setBusy(false);
    if (r.success) setSuccess('资料已保存');
    else setError(r.message);
  };

  const changePassword = async () => {
    setError('');
    setSuccess('');
    if (!oldPassword || !newPassword) {
      setError('请填写原密码和新密码');
      return;
    }
    if (newPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPwd) {
      setError('两次输入的新密码不一致');
      return;
    }
    setBusy(true);
    const r = await onUpdate({ oldPassword, newPassword });
    setBusy(false);
    if (r.success) {
      setSuccess('密码已修改，其他设备已下线');
      setOldPassword('');
      setNewPassword('');
      setConfirmPwd('');
    } else {
      setError(r.message);
    }
  };

  const revokeToken = async (token: string) => {
    if (!confirm('确定让该设备下线吗？下次需要重新登录。')) return;
    try {
      await api.tokensRevoke(token);
      setTokens((prev) => prev.filter((t) => t.token !== token));
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleLogout = () => {
    if (!confirm('确定退出登录吗？')) return;
    onLogout();
  };

  const inputCls =
    'w-full px-4 py-2.5 text-base border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-green-500';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">设置</h2>
            <p className="text-xs text-gray-400 mt-0.5">@{user.username}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {/* 资料 */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">个人资料</h3>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">名字颜色</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-9 h-9 rounded-full transition-transform ${
                      color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  >
                    {color === c && <Check className="w-4 h-4 text-white mx-auto" />}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={saveProfile}
              disabled={busy || !profileChanged}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              保存资料
            </button>
          </section>

          {/* 字号 */}
          <section className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">消息字号</h3>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => onFontSizeChange(Math.max(14, fontSize - 1))}
                className="w-10 h-10 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center"
              >
                <Minus className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
              <div className="flex-1 bg-gray-50 dark:bg-gray-700/60 rounded-lg px-4 py-2.5 text-center text-base font-medium text-gray-800 dark:text-gray-200">
                {fontSize}px
              </div>
              <button
                onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))}
                className="w-10 h-10 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center"
              >
                <Plus className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            <p className="text-xs text-gray-400">范围 14px - 24px，仅保存在本设备</p>
          </section>

          {/* 改密码 */}
          <section className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">修改密码</h3>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="原密码"
              className={inputCls}
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密码（至少 6 位）"
              className={inputCls}
            />
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="确认新密码"
              className={inputCls}
            />
            <button
              onClick={changePassword}
              disabled={busy}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              修改密码
            </button>
          </section>

          {/* 设备管理 */}
          <section className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">登录设备</h3>
            <div className="space-y-2">
              {tokens.map((t) => (
                <div
                  key={t.token}
                  className="flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/40"
                >
                  <Monitor className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                      {t.device_name || '未知设备'}
                      {t.is_current === 1 && <span className="ml-2 text-xs text-green-600">（本设备）</span>}
                    </p>
                    <p className="text-xs text-gray-400">有效期至 {t.expires_at}</p>
                  </div>
                  {t.is_current !== 1 && (
                    <button
                      onClick={() => revokeToken(t.token)}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600"
                      title="让该设备下线"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 text-red-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </div>
  );
};
