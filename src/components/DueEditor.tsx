// 待办到点提醒编辑弹窗：日历面板选日期 + 下拉选时分 + 清除/保存
// 不依赖 datetime-local（部分安卓浏览器/WebView 不渲染选择器，会退化成手输数字）
import { useState, useEffect } from 'react';
import { X, BellRing, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api/client';

interface Props {
  isDarkMode: boolean;
  messageId: number;
  currentDue: string | null;
  groupName?: string; // 显示用（待办面板显示来源群）
  onClose: () => void;
  onSaved: (dueAt: string | null) => void;
}

interface DueParts {
  y: number;
  mo: number; // 0-11
  d: number;
  hh: number; // 0-23
  mm: number; // 0-59
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// 后端 'Y-m-d H:i:s' → 分量
const parseDue = (s: string | null): DueParts | null => {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2] - 1, d: +m[3], hh: +m[4], mm: +m[5] };
};

// 默认提醒时间：当前时间 +1 小时（整点）
const defaultDue = (): DueParts => {
  const n = new Date();
  n.setHours(n.getHours() + 1, 0, 0, 0);
  return { y: n.getFullYear(), mo: n.getMonth(), d: n.getDate(), hh: n.getHours(), mm: 0 };
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const DueEditor = ({ isDarkMode, messageId, currentDue, groupName, onClose, onSaved }: Props) => {
  const init = parseDue(currentDue) ?? defaultDue();
  const [sel, setSel] = useState<DueParts>(init);
  const [viewY, setViewY] = useState(init.y); // 日历正在浏览的年月
  const [viewM, setViewM] = useState(init.mo);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  // 日历格子：当月天数 + 首日星期
  const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
  const firstWeekday = new Date(viewY, viewM, 1).getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const today = new Date();
  const isToday = (d: number) =>
    d === today.getDate() && viewM === today.getMonth() && viewY === today.getFullYear();
  const isSelected = (d: number) => d === sel.d && viewM === sel.mo && viewY === sel.y;

  const pickDay = (d: number) => {
    setSel((p) => ({ ...p, y: viewY, mo: viewM, d }));
  };

  const setDayOffset = (offset: number) => {
    const n = new Date();
    n.setDate(n.getDate() + offset);
    setSel((p) => ({ ...p, y: n.getFullYear(), mo: n.getMonth(), d: n.getDate() }));
    setViewY(n.getFullYear());
    setViewM(n.getMonth());
  };

  // 按月偏移（每月/每季度/半年/一年重复场景）
  const setMonthOffset = (months: number) => {
    const n = new Date();
    n.setMonth(n.getMonth() + months);
    setSel((p) => ({ ...p, y: n.getFullYear(), mo: n.getMonth(), d: n.getDate() }));
    setViewY(n.getFullYear());
    setViewM(n.getMonth());
  };

  const prevMonth = () => {
    if (viewM === 0) {
      setViewM(11);
      setViewY((y) => y - 1);
    } else setViewM((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewM === 11) {
      setViewM(0);
      setViewY((y) => y + 1);
    } else setViewM((m) => m + 1);
  };

  const save = async (due: string | null) => {
    setBusy(true);
    setErr('');
    try {
      const { due_at } = await api.messagesSetDue(messageId, due);
      onSaved(due_at);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const overlayCls = 'fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4';
  const panelCls = `w-full max-w-sm rounded-2xl p-5 shadow-xl ${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-800'}`;
  const selCls = `px-2 py-2 text-base rounded-lg border ${
    isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-800'
  }`;
  const btnCls = `flex-1 px-3 py-2 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed`;
  const quickCls = `px-3 py-1.5 text-sm rounded-lg border ${
    isDarkMode
      ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
      : 'border-gray-300 text-gray-600 hover:bg-gray-100'
  }`;

  return (
    <div className={overlayCls} onClick={onClose}>
      <div className={panelCls} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <BellRing className="w-4 h-4 text-amber-500" />
            设置到点提醒
          </h3>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {groupName && <p className="text-xs text-gray-400 mb-2 truncate">来自{groupName}的待办</p>}

        {/* 快捷日期 */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={() => setDayOffset(0)} className={quickCls}>
            今天
          </button>
          <button onClick={() => setDayOffset(1)} className={quickCls}>
            明天
          </button>
          <button onClick={() => setDayOffset(7)} className={quickCls}>
            一周后
          </button>
          <button onClick={() => setMonthOffset(1)} className={quickCls}>
            一个月后
          </button>
          <button onClick={() => setMonthOffset(3)} className={quickCls}>
            三个月后
          </button>
          <button onClick={() => setMonthOffset(6)} className={quickCls}>
            半年后
          </button>
          <button onClick={() => setMonthOffset(12)} className={quickCls}>
            一年后
          </button>
        </div>

        {/* 日历面板 */}
        <div
          className={`rounded-xl border p-3 ${
            isDarkMode ? 'border-gray-600 bg-gray-700/40' : 'border-gray-200 bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={prevMonth}
              className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`}
              title="上个月"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-base font-semibold">
              {viewY}年{viewM + 1}月
            </span>
            <button
              onClick={nextMonth}
              className={`p-1 rounded-lg ${isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`}
              title="下个月"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-xs text-gray-400 py-1">
                {w}
              </span>
            ))}
            {cells.map((d, i) =>
              d === null ? (
                <span key={`e${i}`} />
              ) : (
                <button
                  key={d}
                  onClick={() => pickDay(d)}
                  className={`h-9 rounded-lg text-base transition-colors ${
                    isSelected(d)
                      ? 'bg-green-500 text-white font-semibold'
                      : isToday(d)
                        ? `border ${isDarkMode ? 'border-green-500 text-green-400' : 'border-green-500 text-green-600'}`
                        : isDarkMode
                          ? 'text-gray-200 hover:bg-gray-700'
                          : 'text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {d}
                </button>
              ),
            )}
          </div>
        </div>

        {/* 时分选择 */}
        <div className="flex items-center gap-2 mt-3">
          <select
            value={sel.hh}
            onChange={(e) => setSel((p) => ({ ...p, hh: +e.target.value }))}
            className={`${selCls} flex-1`}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {pad2(h)} 时
              </option>
            ))}
          </select>
          <span className="text-base text-gray-400">:</span>
          <select
            value={sel.mm}
            onChange={(e) => setSel((p) => ({ ...p, mm: +e.target.value }))}
            className={`${selCls} flex-1`}
          >
            {Array.from({ length: 12 }, (_, i) => i * 5).map((mm) => (
              <option key={mm} value={mm}>
                {pad2(mm)} 分
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-gray-400 mt-2">
          已选：{sel.y}-{pad2(sel.mo + 1)}-{pad2(sel.d)} {pad2(sel.hh)}:{pad2(sel.mm)}。到点前 10 分钟，手机日历会弹出提醒（需在设置页添加日历订阅）。
        </p>
        {err && <p className="text-sm text-red-500 mt-2">{err}</p>}
        <div className="flex gap-2 mt-4">
          {currentDue && (
            <button
              onClick={() => save(null)}
              disabled={busy}
              className={`${btnCls} bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600`}
            >
              清除提醒
            </button>
          )}
          <button
            onClick={() => {
              const due = `${sel.y}-${pad2(sel.mo + 1)}-${pad2(sel.d)}T${pad2(sel.hh)}:${pad2(sel.mm)}:00`;
              void save(due);
            }}
            disabled={busy}
            className={`${btnCls} bg-green-500 text-white hover:bg-green-600`}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
