import { useState, useEffect } from 'react';
import { X, LogOut, Minus, Plus, Monitor, Trash2, Check, Camera, RefreshCw, Copy } from 'lucide-react';
import { User, TokenInfo } from '../../api/types';
import { api } from '../../api/client';
import { setCachedAvatar } from '../../api/avatarCache';
import { AuthResult } from '../../hooks/useAuth';
import { Avatar } from '../Avatar';
import { AvatarCropModal } from '../AvatarCropModal';

interface Props {
  user: User;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  bubbleStyle: 'green' | 'white'; // 我的气泡样式（仅本设备 localStorage）
  onBubbleStyleChange: (style: 'green' | 'white') => void;
  onUpdate: (data: {
    nickname?: string;
    color?: string;
    signature?: string;
    oldPassword?: string;
    newPassword?: string;
  }) => Promise<AuthResult>;
  onAvatarChanged: (ver: number) => void;
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
  bubbleStyle,
  onBubbleStyleChange,
  onUpdate,
  onAvatarChanged,
  onLogout,
  onClose,
}: Props) => {
  const [nickname, setNickname] = useState(user.nickname);
  const [color, setColor] = useState(user.color);
  const [signature, setSignature] = useState(user.signature || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [cropOpen, setCropOpen] = useState(false);
  const [isDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  // 日历订阅
  const [icsCopied, setIcsCopied] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [icsBusy, setIcsBusy] = useState(false);

  useEffect(() => {
    api
      .tokensList()
      .then(({ tokens: list }) => setTokens(list))
      .catch(() => undefined);
    // 日历订阅 token（首次自动生成）
    api
      .eventsIcsToken()
      .then((r) => setIcsUrl(api.icsUrlOf(r.token)))
      .catch(() => undefined);
  }, []);

  // 重置订阅地址：旧地址立即失效，需在日历 App 重新添加
  const resetIcs = async () => {
    if (!confirm('重置后旧订阅地址将立即失效，需要在手机日历里删除旧订阅、重新添加新地址。确定重置吗？')) return;
    setIcsBusy(true);
    try {
      const r = await api.eventsRotateIcs();
      setIcsUrl(api.icsUrlOf(r.token));
      setIcsCopied(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : '重置失败');
    } finally {
      setIcsBusy(false);
    }
  };

  const profileChanged =
    nickname.trim() !== user.nickname ||
    color !== user.color ||
    signature.trim() !== (user.signature || '');

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
      signature: signature.trim() !== (user.signature || '') ? signature.trim() : undefined,
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
            {/* 头像：大号头像居中，按钮另起一行 */}
            <div className="flex flex-col items-center space-y-2.5">
              <Avatar
                userId={user.id}
                nickname={user.nickname}
                color={user.color}
                avatarVer={user.avatar_ver}
                size={80}
                onClick={() => setCropOpen(true)}
                className="ring-2 ring-gray-200 dark:ring-gray-600"
              />
              <button
                onClick={() => setCropOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600"
              >
                <Camera className="w-4 h-4" />
                <span>更换头像</span>
              </button>
            </div>
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
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1.5">
                签名
                <span className="text-xs text-gray-400 ml-2">{signature.length}/500，好友查看你的信息时可见</span>
              </label>
              <textarea
                value={signature}
                onChange={(e) => setSignature(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="介绍一下自己吧"
                className={`${inputCls} resize-none`}
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

          {/* 我的气泡样式：两个预览小块单选，与字号一样仅保存在本设备 */}
          <section className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">我的气泡样式</h3>
            <div className="flex gap-3">
              <button
                onClick={() => onBubbleStyleChange('green')}
                className={`flex-1 rounded-xl p-3 bg-gray-50 dark:bg-gray-700/60 transition-shadow ${
                  bubbleStyle === 'green' ? 'ring-2 ring-green-500' : 'ring-1 ring-gray-200 dark:ring-gray-600 hover:ring-gray-300'
                }`}
                title="自己发的消息显示为绿底白字"
              >
                <span className="block ml-auto w-fit max-w-full px-3 py-1.5 rounded-lg rounded-br-md bg-green-500 text-white text-sm shadow-sm">
                  你好
                </span>
                <span className="block mt-2 text-center text-sm text-gray-600 dark:text-gray-300">经典绿底</span>
              </button>
              <button
                onClick={() => onBubbleStyleChange('white')}
                className={`flex-1 rounded-xl p-3 bg-gray-50 dark:bg-gray-700/60 transition-shadow ${
                  bubbleStyle === 'white' ? 'ring-2 ring-green-500' : 'ring-1 ring-gray-200 dark:ring-gray-600 hover:ring-gray-300'
                }`}
                title="自己发的消息与对方一样白底黑字"
              >
                <span className="block ml-auto w-fit max-w-full px-3 py-1.5 rounded-lg rounded-br-md bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 text-sm shadow-sm">
                  你好
                </span>
                <span className="block mt-2 text-center text-sm text-gray-600 dark:text-gray-300">简洁白底</span>
              </button>
            </div>
            <p className="text-xs text-gray-400">仅改变本设备显示，不影响其他成员</p>
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
                      {t.is_current === 1 && <span className="ml-2 text-sm text-green-600">（本设备）</span>}
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

          {/* 日历订阅 */}
          <section className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-5">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">日历订阅</h3>
            <p className="text-xs text-gray-400">
              给待办设置到点提醒后，把下面的链接添加到手机日历（iPhone：日历 → 账户 → 添加订阅日历；
              安卓：日历 App → 设置 → 添加账号/订阅），到点前 10 分钟会弹系统通知。
              链接包含你的专属订阅凭证，请勿分享给他人；若怀疑泄露，可点击下方「重置订阅地址」。
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={icsUrl}
                placeholder="正在生成订阅地址…"
                onFocus={(e) => e.target.select()}
                className={`flex-1 min-w-0 px-3 py-2 rounded-lg border text-xs truncate ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-gray-300'
                    : 'bg-gray-50 border-gray-200 text-gray-600'
                }`}
              />
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(icsUrl);
                    setIcsCopied(true);
                    setTimeout(() => setIcsCopied(false), 1500);
                  } catch {
                    // 剪贴板不可用时忽略
                  }
                }}
                disabled={!icsUrl}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title="复制订阅链接"
              >
                <Copy className="w-4 h-4" />
                <span>{icsCopied ? '已复制' : '复制'}</span>
              </button>
            </div>
            <div>
              <button
                onClick={() => void resetIcs()}
                disabled={icsBusy || !icsUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="停用旧地址并生成新地址"
              >
                <RefreshCw className={`w-4 h-4 ${icsBusy ? 'animate-spin' : ''}`} />
                <span>重置订阅地址</span>
              </button>
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

        {/* 头像裁剪上传 */}
        {cropOpen && (
          <AvatarCropModal
            isDarkMode={isDarkMode}
            onClose={() => setCropOpen(false)}
            onDone={async (dataUrl) => {
              try {
                const r = await api.setAvatar(dataUrl);
                setCachedAvatar(user.id, r.avatar_ver, dataUrl);
                onAvatarChanged(r.avatar_ver);
                setCropOpen(false);
                setSuccess('头像已更新');
              } catch (e) {
                setError(e instanceof Error ? e.message : '头像上传失败');
              }
            }}
          />
        )}
      </div>
    </div>
  );
};
