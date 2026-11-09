import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Zap, Plus, Trash2, X, PencilLine, RotateCcw } from 'lucide-react';

// 快速录入短语的插入方式：前插（追加到原文本前）/ 覆盖（替换整个文本框）/ 后插（追加到原文本后）
export type QuickInsertMode = 'prepend' | 'overwrite' | 'append';

interface Props {
  storageKey: string; // 场景标识（如 todo-note）：短语列表与插入方式按场景独立保存在本设备
  defaultPhrases: string[]; // 默认短语（首次使用 / 恢复默认时用）
  value: string; // 绑定文本框的当前值
  onChange: (v: string) => void;
  isDarkMode: boolean;
  defaultMode?: QuickInsertMode; // 用户未手动选择过插入方式时的初始值，缺省 append
  accent?: 'amber' | 'green'; // 短语按钮的 hover 强调色，默认 green
}

const MODE_KEY = (k: string) => `smallchat-quick-mode:${k}`;
const PHRASES_KEY = (k: string) => `smallchat-quick-phrases:${k}`;
const MAX_PHRASE_LEN = 100;

const MODES: { key: QuickInsertMode; label: string; title: string }[] = [
  { key: 'prepend', label: '前插', title: '追加到当前文本前面' },
  { key: 'overwrite', label: '覆盖', title: '覆盖整个文本框' },
  { key: 'append', label: '后插', title: '追加到当前文本后面' },
];

// 可复用的快速录入短语条：短语 chips + 插入方式切换 + 管理短语弹窗（新增/编辑/删除/恢复默认）
// 设计参照 CRM 项目的快捷短语范式，短语与插入方式均持久化在本设备 localStorage
export const QuickPhrases = ({
  storageKey,
  defaultPhrases,
  value,
  onChange,
  isDarkMode,
  defaultMode = 'append',
  accent = 'green',
}: Props) => {
  const [phrases, setPhrases] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PHRASES_KEY(storageKey));
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list.filter((s) => typeof s === 'string' && s.trim());
      }
    } catch {
      // 解析失败则用默认短语
    }
    return defaultPhrases;
  });
  const [mode, setMode] = useState<QuickInsertMode>(() => {
    const raw = localStorage.getItem(MODE_KEY(storageKey));
    return raw === 'prepend' || raw === 'overwrite' || raw === 'append' ? raw : defaultMode;
  });
  const [editing, setEditing] = useState(false);
  // 管理弹窗内的草稿列表（取消则不保存，已录入内容不受影响）
  const [draft, setDraft] = useState<string[]>([]);

  const persistPhrases = (list: string[]) => {
    setPhrases(list);
    localStorage.setItem(PHRASES_KEY(storageKey), JSON.stringify(list));
  };
  const changeMode = (m: QuickInsertMode) => {
    setMode(m);
    localStorage.setItem(MODE_KEY(storageKey), m);
  };

  const insert = (phrase: string) => {
    const t = value.trim();
    if (mode === 'overwrite') onChange(phrase);
    else if (mode === 'prepend') onChange(t ? `${phrase}，${t}` : phrase);
    else onChange(t ? `${t}，${phrase}` : phrase);
  };

  const openEditor = () => {
    setDraft([...phrases]);
    setEditing(true);
  };
  const saveEditor = () => {
    const list = draft.map((s) => s.trim()).filter(Boolean);
    persistPhrases(list);
    setEditing(false);
  };
  const restoreDefaults = () => {
    // 仅替换草稿，点「保存」后才真正生效，取消可挽回
    setDraft([...defaultPhrases]);
  };

  const chipHover =
    accent === 'amber'
      ? 'hover:bg-amber-50 hover:border-amber-400 dark:hover:bg-gray-700'
      : 'hover:bg-green-50 hover:border-green-400 dark:hover:bg-gray-700';

  return (
    <div>
      <div className={`text-sm mb-1.5 flex items-center gap-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
        <Zap className="w-3.5 h-3.5 text-amber-500" />
        <span>快速输入</span>
        {/* 插入方式切换：前插 / 覆盖 / 后插，选择后按场景记忆 */}
        <span className={`ml-1 inline-flex rounded-lg border overflow-hidden ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => changeMode(m.key)}
              title={m.title}
              className={`px-2 py-0.5 text-xs transition-colors ${
                mode === m.key
                  ? 'bg-green-500 text-white'
                  : isDarkMode
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={openEditor}
          className={`flex items-center gap-0.5 text-xs ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
          title="修改 / 新建 / 删除快速录入短语"
        >
          <PencilLine className="w-3.5 h-3.5" />
          管理短语
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {phrases.map((tag, i) => (
          <button
            key={`${i}-${tag}`}
            type="button"
            onClick={() => insert(tag)}
            className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
              isDarkMode ? 'border-gray-600 text-gray-200' : 'border-gray-300 text-gray-700'
            } ${chipHover}`}
          >
            {tag}
          </button>
        ))}
        {phrases.length === 0 && (
          <span className="text-xs text-gray-400 py-1">暂无短语，点击右上角「管理短语」添加</span>
        )}
      </div>

      {editing &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-[95] p-4"
            onClick={() => setEditing(false)}
          >
            <div
              className={`rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[80vh] ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>管理快速录入短语</h3>
                <button
                  onClick={() => setEditing(false)}
                  className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-2 overflow-y-auto">
                <p className="text-xs text-gray-400">保存后立即更新短语按钮；点「取消」放弃修改。</p>
                {draft.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={p}
                      maxLength={MAX_PHRASE_LEN}
                      onChange={(e) =>
                        setDraft((prev) => prev.map((s, j) => (j === i ? e.target.value : s)))
                      }
                      placeholder="输入一条短语"
                      className={`flex-1 min-w-0 px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-green-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => prev.filter((_, j) => j !== i))}
                      className={`p-1.5 rounded-lg flex-shrink-0 ${isDarkMode ? 'text-gray-400 hover:text-red-400 hover:bg-gray-700' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100'}`}
                      title="删除这条短语"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => [...prev, ''])}
                    className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border ${
                      isDarkMode
                        ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    添加短语
                  </button>
                  <button
                    type="button"
                    onClick={restoreDefaults}
                    className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg ${
                      isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'
                    }`}
                    title="用默认短语替换当前列表（保存后生效）"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    恢复默认
                  </button>
                </div>
              </div>
              <div className={`flex justify-end gap-2 p-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className={`px-4 py-2 text-sm rounded-lg ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={saveEditor}
                  className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600"
                >
                  保存
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
