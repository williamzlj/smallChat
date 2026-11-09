import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, BellRing, ChevronRight } from 'lucide-react';
import { QuickPhrases } from './QuickPhrases';

// 快速文本默认短语：紧急/重要 + 时长（按时间从短到长排序，便于扫描）
// 用户可在「管理短语」中自定义，保存在本设备
export const TODO_QUICK_TAGS = [
  '特别紧急',
  '重要',
  '预计10分钟',
  '预计30分钟',
  '预计1小时',
  '预计2小时',
  '预计1天',
  '预计2天',
];

interface Props {
  isDarkMode: boolean;
  title: string; // 弹窗标题（添加待办备注 / 修改待办备注 / 设为待办事项）
  initialNote: string; // 初始备注（已有待办备注；用于"还原"按钮）
  onSave: (note: string) => Promise<void> | void;
  // 标记为已完成并保存（可选）：传入后按钮才显示，用于"事情已做完、补流程"的场景，省去保存后再标记
  onSaveDone?: (note: string) => Promise<void> | void;
  // 设置提醒入口（可选）：传入后才显示；点击时一并提交当前备注并打开到点提醒编辑
  onSetDue?: (note: string) => Promise<void> | void;
  onClose: () => void;
}

// 待办备注编辑弹窗：textarea + 快速文本按钮 + 设置提醒入口 + 还原按钮
export const TodoNoteModal = ({ isDarkMode, title, initialNote, onSave, onSaveDone, onSetDue, onClose }: Props) => {
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  // 是否修改过：控制"还原"按钮显隐（没改过就不显示，避免干扰）
  const changed = note !== initialNote;

  // 还原：恢复初始备注
  const restore = () => setNote(initialNote);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(note.trim());
    } finally {
      setSaving(false);
    }
  };

  // 标记为已完成并保存：直接提交为已完成待办（补流程场景，避免保存后再二次标记）
  const saveDone = async () => {
    if (saving || !onSaveDone) return;
    setSaving(true);
    try {
      await onSaveDone(note.trim());
    } finally {
      setSaving(false);
    }
  };

  // 设置提醒：先提交备注（避免已填内容丢失），再由外部打开到点提醒编辑
  const setDue = async () => {
    if (saving || !onSetDue) return;
    setSaving(true);
    try {
      await onSetDue(note.trim());
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-xl w-full max-w-sm ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{title}</h3>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {/* 快速录入短语：默认前插保持原习惯，可切换覆盖/后插；短语可在「管理短语」中自定义 */}
          <QuickPhrases
            storageKey="todo-note"
            defaultPhrases={TODO_QUICK_TAGS}
            value={note}
            onChange={setNote}
            isDarkMode={isDarkMode}
            defaultMode="prepend"
            accent="amber"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={3}
            autoFocus
            placeholder="待办备注，留空清除"
            className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-amber-500 resize-none ${
              isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'
            }`}
          />
          {/* 设置提醒入口：顺手把这条待办设个到点提醒（会先保存当前备注） */}
          {onSetDue && (
            <button
              onClick={() => void setDue()}
              disabled={saving}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
                isDarkMode
                  ? 'border-amber-500/60 text-amber-300 hover:bg-gray-700'
                  : 'border-amber-400 text-amber-700 hover:bg-amber-50'
              }`}
            >
              <BellRing className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">设置到点提醒</span>
              <ChevronRight className="w-4 h-4 opacity-60" />
            </button>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            {changed && initialNote !== '' && (
              <button
                onClick={restore}
                className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1 ${
                  isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="恢复为原来的备注"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                还原
              </button>
            )}
            <span className="flex-1" />
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className={`px-4 py-2 text-sm rounded-lg ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                取消
              </button>
              {onSaveDone && (
                <button
                  onClick={() => void saveDone()}
                  disabled={saving}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
                    isDarkMode
                      ? 'border-green-500/60 text-green-400 hover:bg-gray-700'
                      : 'border-green-500 text-green-600 hover:bg-green-50'
                  }`}
                >
                  标记为已完成
                </button>
              )}
              <button
                onClick={() => void save()}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
