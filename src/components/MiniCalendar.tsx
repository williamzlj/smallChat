import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// 自绘日历：项目内不使用原生 <input type="date">（安卓 WebView / 部分内嵌浏览器点不出选择器）
// 纯日期语义：value/onChange 一律是 YYYY-MM-DD 字符串，禁止 new Date('YYYY-MM-DD') 解析（会按 UTC 解释导致偏移）
interface Props {
  value: string; // 已选日期 YYYY-MM-DD（空串=未选，视图停在今天）
  onChange: (date: string) => void;
  isDarkMode: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtD = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

const todayStr = () => {
  const n = new Date();
  return fmtD(n.getFullYear(), n.getMonth() + 1, n.getDate());
};

// 字符串 → 分量；非法/为空时回退到今天
function splitDate(s: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export const MiniCalendar = ({ value, onChange, isDarkMode }: Props) => {
  const init = splitDate(value);
  const [viewY, setViewY] = useState(init.y);
  const [viewM, setViewM] = useState(init.m); // 1-12

  const daysInMonth = new Date(viewY, viewM, 0).getDate();
  const firstWeekday = new Date(viewY, viewM - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const today = todayStr();
  const sel = splitDate(value);
  const isSel = (d: number) => value !== '' && sel.y === viewY && sel.m === viewM && sel.d === d;

  const shiftMonth = (n: number) => {
    const d = new Date(viewY, viewM - 1 + n, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth() + 1);
  };
  const backToday = () => {
    const n = new Date();
    setViewY(n.getFullYear());
    setViewM(n.getMonth() + 1);
  };

  const navBtn = `p-1 rounded-lg ${isDarkMode ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-600 hover:bg-gray-200'}`;

  return (
    <div className={`mt-1 rounded-xl border p-2 ${isDarkMode ? 'border-gray-600 bg-gray-700/40' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <button type="button" onClick={() => shiftMonth(-1)} className={navBtn} title="上个月">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={backToday}
          className={`text-sm font-medium ${isDarkMode ? 'text-gray-200 hover:text-white' : 'text-gray-700 hover:text-black'}`}
          title="回到今天所在月份"
        >
          {viewY}年{viewM}月
        </button>
        <button type="button" onClick={() => shiftMonth(1)} className={navBtn} title="下个月">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className={`text-xs py-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>
            {w}
          </span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} />
          ) : (
            <button
              type="button"
              key={d}
              onClick={() => onChange(fmtD(viewY, viewM, d))}
              className={`h-8 rounded-lg text-sm transition-colors ${
                isSel(d)
                  ? 'bg-green-500 text-white font-semibold'
                  : fmtD(viewY, viewM, d) === today
                    ? isDarkMode
                      ? 'border border-green-500 text-green-400'
                      : 'border border-green-500 text-green-600'
                    : isDarkMode
                      ? 'text-gray-200 hover:bg-gray-600'
                      : 'text-gray-700 hover:bg-gray-200'
              }`}
            >
              {d}
            </button>
          ),
        )}
      </div>
    </div>
  );
};
