import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, RotateCcw } from 'lucide-react';

// 快速文本：紧急/重要 + 时长（按时间从短到长排序，便于扫描）
export const TODO_QUICK_TAGS = [
  '特别紧急',
  '特别重要',
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
  onClose: () => void;
}

// 待办备注编辑弹窗：textarea + 快速文本按钮 + 还原按钮
export const TodoNoteModal = ({ isDarkMode, title, initialNote, onSave, onClose }: Props) => {
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  // 是否修改过：控制"还原"按钮显隐（没改过就不显示，避免干扰）
  const changed = note !== initialNote;

  // 快速文本插入到已有文本最前面（不覆盖），已有文本时用中文逗号衔接
  const appendTag = (tag: string) => {
    setNote((prev) => {
      const t = prev.trim();
      return t ? `${tag}，${t}` : tag;
    });
  };

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
          <div>
            <p className={`text-sm mb-1.5 flex items-center gap-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              快速输入（插入到备注最前面）
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TODO_QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => appendTag(tag)}
                  className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
                    isDarkMode
                      ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                      : 'border-gray-300 text-gray-700 hover:bg-amber-50 hover:border-amber-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
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
