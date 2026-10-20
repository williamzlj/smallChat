import { useState } from 'react';
import { X, Users, Loader2, ArrowLeft, Send } from 'lucide-react';
import { Group } from '../api/types';

interface Props {
  groups: Group[]; // 可选目标群（已排除停用群）
  count: number; // 待转发消息条数
  onConfirm: (groupId: number) => Promise<void>;
  onClose: () => void;
  isDarkMode: boolean;
}

// 合并转发：选择目标群 → 确认 → 发送
export const ForwardModal = ({ groups, count, onConfirm, onClose, isDarkMode }: Props) => {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (g: Group) => {
    if (busy) return;
    setSelectedGroup(g);
    setError('');
  };

  const confirm = async () => {
    if (!selectedGroup || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(selectedGroup.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '转发失败');
      setBusy(false);
    }
  };

  const back = () => {
    if (busy) return;
    setSelectedGroup(null);
    setError('');
  };

  const isConfirmStep = selectedGroup !== null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-xl w-full max-w-sm max-h-[70vh] flex flex-col ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-4 border-b flex-shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2 min-w-0">
            {isConfirmStep && (
              <button
                onClick={back}
                className={`p-1 rounded-lg flex-shrink-0 ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
                title="返回"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className={`text-base font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              {isConfirmStep ? '确认转发' : `转发 ${count} 条消息到…`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg flex-shrink-0 ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isConfirmStep ? (
          <div className="p-3 overflow-y-auto">
            {error && <p className="text-sm text-red-500 px-2 pb-2">{error}</p>}
            {groups.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">没有可转发的群聊</p>
            ) : (
              groups.map((g) => {
                const dmPeer = g.is_dm === 1 ? g.dm_peer : null;
                return (
                  <button
                    key={g.id}
                    onClick={() => pick(g)}
                    disabled={busy}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-colors disabled:opacity-60 ${
                      isDarkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-100'
                    }`}
                  >
                    {dmPeer ? (
                      <span
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: dmPeer.color }}
                      >
                        {dmPeer.nickname.slice(0, 1).toUpperCase()}
                      </span>
                    ) : (
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-gray-600 text-gray-300' : 'bg-green-100 text-green-600'}`}>
                        <Users className="w-4 h-4" />
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm font-medium truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {dmPeer ? dmPeer.nickname : g.name}
                      </span>
                      <span className="block text-xs text-gray-400">{dmPeer ? '私聊' : `${g.member_count} 位成员`}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className={`rounded-xl p-4 text-center ${isDarkMode ? 'bg-gray-700/60' : 'bg-gray-50'}`}>
              <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                将 <span className="font-bold text-blue-500">{count}</span> 条消息转发到
              </p>
              <p className={`text-lg font-bold mt-2 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                {selectedGroup.is_dm === 1 ? `私聊：${selectedGroup.dm_peer?.nickname}` : selectedGroup.name}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={back}
                disabled={busy}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${
                  isDarkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                取消
              </button>
              <button
                onClick={confirm}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                确认转发
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
