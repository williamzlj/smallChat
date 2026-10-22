import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// 消息备注编辑弹窗（单窗口完成：选私有/公共 + 输入）
// 聊天区右键与待办面板右键共用
export const NoteModal = ({
  isDarkMode,
  canPublic,
  publicNote,
  privateNote,
  onSave,
  onClose,
}: {
  isDarkMode: boolean;
  canPublic: boolean; // 是否允许编辑公共备注（作者/管理员）
  publicNote: string;
  privateNote: string;
  onSave: (note: string, scope: 'private' | 'public') => Promise<void> | void;
  onClose: () => void;
}) => {
  const [pubNote, setPubNote] = useState(publicNote);
  const [privNote, setPrivNote] = useState(privateNote);
  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-xl w-full max-w-sm ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>消息备注</h3>
          <button onClick={onClose} className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* 公共备注 */}
          <div>
            <div className={`flex items-center justify-between mb-1 ${canPublic ? '' : 'opacity-50'}`}>
              <span className={`text-sm font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                公共备注（全员可见）
              </span>
              {!canPublic && (
                <span className="text-xs text-gray-400" title="仅消息作者或管理员可编辑公共备注">
                  只读
                </span>
              )}
            </div>
            <textarea
              value={pubNote}
              onChange={(e) => canPublic && setPubNote(e.target.value.slice(0, 500))}
              readOnly={!canPublic}
              rows={3}
              autoFocus={canPublic}
              placeholder={canPublic ? '公共备注，全员可见（留空清除）' : '无公共备注'}
              className={`w-full px-3 py-2 text-sm border rounded-lg outline-none resize-none ${
                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'
              } ${canPublic ? 'focus:ring-2 focus:ring-blue-500' : 'cursor-not-allowed'}`}
            />
          </div>
          {/* 个人备注 */}
          <div>
            <span className={`text-sm font-medium ${isDarkMode ? 'text-green-300' : 'text-green-600'}`}>
              我的备注（仅自己可见）
            </span>
            <textarea
              value={privNote}
              onChange={(e) => setPrivNote(e.target.value.slice(0, 500))}
              rows={3}
              autoFocus={!canPublic}
              placeholder="私有备注，仅自己可见（留空清除）"
              className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-green-500 resize-none ${
                isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'
              }`}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm rounded-lg ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              取消
            </button>
            <button
              onClick={async () => {
                // 顺序保存，避免 SQLite 并发写锁冲突；非作者跳过公共备注
                if (canPublic) {
                  await onSave(pubNote.trim(), 'public');
                }
                await onSave(privNote.trim(), 'private');
                onClose();
              }}
              className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
