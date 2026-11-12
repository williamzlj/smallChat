import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wallet, X, Plus, Loader2, Trash2, Calendar, RotateCcw } from 'lucide-react';
import { api } from '../api/client';
import { AmountType, Category, ChatMessage } from '../api/types';
import { fmtMoney } from './MessageBubble';
import { MiniCalendar } from './MiniCalendar';

// 补账快捷：今天 / 昨天 / 前天（纯日期字符串，不解析 Date，避免时区偏移）
const QUICK_DAYS = [
  { label: '今天', offset: 0 },
  { label: '昨天', offset: 1 },
  { label: '前天', offset: 2 },
];

const pad2 = (n: number) => String(n).padStart(2, '0');

// 最近用过的分类：仅存浏览器本地（按群隔离），用于给分类提供快捷按钮
const RECENT_CATS_KEY = (groupId: number) => `smallchat-recent-cats-${groupId}`;

function loadRecentCats(groupId: number): string[] {
  try {
    const raw = localStorage.getItem(RECENT_CATS_KEY(groupId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, 10) : [];
  } catch {
    return [];
  }
}

// 从消息文本里识别金额，最多返回 3 个候选（按出现顺序，去重）。
// 匹配优先级：① 特征明显的金额写法「19.2元」「19块」「￥19.2」「19圆」；② 都没有时再退化为裸数字（如「买了两杯咖啡 19.2」）。
const AMOUNT_RE = /(?:¥|￥)?\s*(\d{1,9}(?:\.\d{1,2})?)\s*(?:元|块|圆)/g;
const CURRENCY_RE = /(?:¥|￥)\s*(\d{1,9}(?:\.\d{1,2})?)/g;
const NUMBER_RE = /\d{1,9}(?:\.\d{1,2})?/g;
const detectAmounts = (text: string): string[] => {
  const out: string[] = [];
  const push = (raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    const s = String(n);
    if (!out.includes(s) && out.length < 3) out.push(s);
  };
  for (const re of [AMOUNT_RE, CURRENCY_RE]) {
    for (const m of text.matchAll(re)) push(m[1]);
    if (out.length > 0) return out;
  }
  // 裸数字兜底：跳过紧贴其他数字/小数点的片段（避免把长数字拆成多段）
  for (const m of text.matchAll(NUMBER_RE)) {
    const i = m.index ?? 0;
    const before = text[i - 1] ?? '';
    const after = text[i + m[0].length] ?? '';
    if (/[\d.]/.test(before) || /[\d.]/.test(after)) continue;
    push(m[0]);
    if (out.length >= 3) break;
  }
  return out;
};

function dayOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface Props {
  isDarkMode: boolean;
  fontSize: number;
  message: ChatMessage;
  initialType: AmountType;
  initialCategory: string;
  inheritHint: string; // 自动继承原消息分类时的提示（为空则不显示）
  // 保存成功后回传后端最终值（kind=0 表示已清除记账）
  onSaved: (kind: number, cents: number | null, category: string, amount_date: string | null) => void;
  onClose: () => void;
}

// 四类录入：(kind, 符号) 的组合；金额恒为正数，符号在这里确定
const TYPE_OPTS: {
  type: AmountType;
  label: string;
  kind: 1 | 2;
  sign: 1 | -1;
  hint: string;
  activeCls: string;
}[] = [
  { type: 'expense', label: '支出', kind: 1, sign: 1, hint: '花出去的钱，计入本月支出', activeCls: 'bg-red-500 text-white' },
  { type: 'refund', label: '退款', kind: 1, sign: -1, hint: '抵减本月支出（不计入收入）', activeCls: 'bg-rose-400 text-white' },
  { type: 'income', label: '收入', kind: 2, sign: 1, hint: '收到的钱，计入本月收入', activeCls: 'bg-green-500 text-white' },
  { type: 'incomeRev', label: '收入调减', kind: 2, sign: -1, hint: '抵减本月收入', activeCls: 'bg-emerald-400 text-white' },
];

// 记账弹窗：选类型（支出/退款/收入/收入调减）+ 填金额 + 选分类
export const AmountEditor = ({
  isDarkMode,
  fontSize,
  message,
  initialType,
  initialCategory,
  inheritHint,
  onSaved,
  onClose,
}: Props) => {
  const [type, setType] = useState<AmountType>(initialType);
  const [amountText, setAmountText] = useState(
    message.amount_cents !== null && message.amount_cents !== 0 ? (Math.abs(message.amount_cents) / 100).toString() : '',
  );
  const [category, setCategory] = useState(initialCategory);
  // 记账日期：已有记账→用后端存的记账日；新记账→默认消息发送日（YYYY-MM-DD，纯日期字符串，禁止 Date() 解析）
  const [amountDate, setAmountDate] = useState<string>(
    message.amount_date ?? (message.created_at.length >= 10 ? message.created_at.slice(0, 10) : ''),
  );
  const [cats, setCats] = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calOpen, setCalOpen] = useState(false); // 自绘日历展开状态
  // 最近用过的分类（浏览器本地，按群隔离）；只展示与当前收支侧匹配的前三个
  const [recentCats, setRecentCats] = useState<string[]>(() => loadRecentCats(message.group_id));

  const hasAmount = message.amount_kind > 0 && message.amount_cents !== null && message.amount_cents !== 0;
  // 打开弹窗时的原始金额：已记过账=原记账金额；没记过账=0（「重置」按钮恢复用）
  const originalAmount =
    message.amount_cents !== null && message.amount_cents !== 0 ? (Math.abs(message.amount_cents) / 100).toString() : '0';
  const opt = TYPE_OPTS.find((o) => o.type === type) ?? TYPE_OPTS[0];
  const sideCats = useMemo(() => cats.filter((c) => c.kind === opt.kind), [cats, opt.kind]);
  // 分类快捷按钮：最近用过且属于当前收支侧的分类，最多三个
  const quickCats = useMemo(
    () => recentCats.filter((n) => sideCats.some((c) => c.name === n)).slice(0, 3),
    [recentCats, sideCats],
  );
  // 金额自动识别（仅做提示，不自动写入，避免覆盖用户输入）；多个候选时列出前 3 个供点选
  const detectedAmounts = useMemo(() => detectAmounts(message.content ?? ''), [message.content]);

  const loadCats = async () => {
    setCatsLoading(true);
    try {
      const { categories } = await api.categoriesList(message.group_id);
      setCats(categories);
    } catch {
      // 静默：分类拉取失败不阻塞记账（分类可留空）
    } finally {
      setCatsLoading(false);
    }
  };

  useEffect(() => {
    void loadCats();
  }, []);

  // 切换类型（支出侧 ↔ 收入侧）时，若原分类不属于当前侧则清空，避免出现跨侧分类
  // 注意：分类字典尚未加载完成时不能清空，否则会误清掉继承来的分类
  useEffect(() => {
    if (catsLoading) return;
    if (category && !sideCats.some((c) => c.name === category)) setCategory('');
  }, [sideCats, catsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // 新增分类：字典按群隔离（本群共用一套），新增后自动选中
  const addCategory = async () => {
    const name = window.prompt('新增分类名称（1~20 字）', '');
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 20) {
      alert('分类名需 1~20 字');
      return;
    }
    try {
      await api.categoriesAdd(message.group_id, opt.kind, trimmed);
      await loadCats();
      setCategory(trimmed);
    } catch (e) {
      alert(e instanceof Error ? e.message : '新增分类失败');
    }
  };

  const yuan = parseFloat(amountText);
  const cents = Math.round(yuan * 100) * opt.sign;
  const valid = Number.isFinite(yuan) && yuan > 0;

  const save = async () => {
    if (!valid) {
      alert('请输入大于 0 的金额');
      return;
    }
    if (Math.abs(cents) > 99999999999) {
      alert('金额超出范围（单笔上限 999,999,999.99 元）');
      return;
    }
    setSaving(true);
    try {
      const cat = category.trim();
      await api.messagesSetAmount(message.id, opt.kind, cents, cat, amountDate);
      // 记录最近使用的分类（浏览器本地）：置顶去重，存 10 条，展示时按收支侧取前三个
      if (cat) {
        const next = [cat, ...recentCats.filter((n) => n !== cat)].slice(0, 10);
        setRecentCats(next);
        try {
          localStorage.setItem(RECENT_CATS_KEY(message.group_id), JSON.stringify(next));
        } catch {
          // 本地存储不可用时忽略
        }
      }
      onSaved(opt.kind, cents, cat, amountDate);
    } catch (e) {
      alert(e instanceof Error ? e.message : '记账失败');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm('确定清除这条消息的记账吗？（消息本身不受影响）')) return;
    setSaving(true);
    try {
      await api.messagesSetAmount(message.id, 0);
      onSaved(0, null, '', null);
    } catch (e) {
      alert(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const labelCls = `text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`;

  return createPortal(
    // 遮罩对齐 visualViewport：top 用 --app-top（iOS 键盘弹出时可视区会整体下移，
    // fixed 仍按布局视口定位，不补偿就会跑到上方并露出大片空白），高度用 --app-height；
    // 键盘弹出时弹窗整体落在键盘上方，卡片内部滚动
    <div
      className="fixed inset-x-0 bg-black/60 flex items-center justify-center z-[90] p-4"
      style={{ top: 'var(--app-top, 0px)', height: 'var(--app-height, 100dvh)' }}
      onClick={onClose}
    >
      <div
        className={`rounded-2xl shadow-xl w-full max-w-sm max-h-full overflow-y-auto ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`text-base font-bold flex items-center gap-1.5 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
            <Wallet className="w-5 h-5 text-rose-500" />
            {hasAmount ? '修改金额' : '记账'}
          </h3>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* 类型：四个按钮一行 */}
          <div className="grid grid-cols-4 gap-1.5">
            {TYPE_OPTS.map((o) => (
              <button
                key={o.type}
                onClick={() => setType(o.type)}
                className={`py-2 text-sm rounded-lg font-medium transition-colors ${
                  type === o.type ? o.activeCls : isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{opt.hint}</p>

          {/* 金额 */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className={`${labelCls} flex-shrink-0`}>金额（元）</span>
              {/* 识别金额做成「今天/昨天」同款圆角按钮：常驻不消失，点错可重选；当前生效的候选高亮。
                  重置：已记过账→恢复打开弹窗前的金额；未记过账→0 */}
              <span className="flex flex-wrap items-center justify-end gap-1">
                {detectedAmounts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmountText(a)}
                    title={`填入识别到的金额 ${a} 元`}
                    className={`px-2 py-0.5 text-sm rounded-full border transition-colors ${
                      amountText === a
                        ? 'border-green-500 text-green-600'
                        : isDarkMode
                          ? 'border-gray-600 text-gray-300 hover:bg-gray-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {a}元
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmountText(originalAmount)}
                  title={hasAmount ? `恢复为修改前的金额 ${originalAmount} 元` : '尚未记过账，重置为 0'}
                  className={`flex items-center gap-0.5 px-2 py-0.5 text-sm rounded-full border transition-colors ${
                    isDarkMode
                      ? 'border-gray-600 text-gray-300 hover:bg-gray-600'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <RotateCcw className="w-3 h-3" />
                  重置
                </button>
              </span>
            </div>
            <div className={`flex items-center rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'border-gray-300'}`}>
              <span className={`pl-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>¥</span>
              <input
                value={amountText}
                onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, '').slice(0, 13))}
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                className={`flex-1 px-2 py-2 bg-transparent outline-none ${isDarkMode ? 'text-white placeholder-gray-400' : ''}`}
                style={{ fontSize: `${Math.max(fontSize, 16)}px` }}
              />
            </div>
          </div>

          {/* 记账日期（补账场景：记账日 ≠ 消息发送日，默认=消息日期）
              用自绘日历，不用原生 <input type="date">：内嵌浏览器/WebView 里原生控件点不出选择器 */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className={labelCls}>记账日期</span>
              <div className="flex items-center gap-1">
                {QUICK_DAYS.map((q) => {
                  const d = dayOffset(q.offset);
                  return (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => {
                        setAmountDate(d);
                        setCalOpen(false);
                      }}
                      className={`px-2 py-0.5 text-sm rounded-full border transition-colors ${
                        amountDate === d
                          ? 'border-green-500 text-green-600'
                          : isDarkMode
                            ? 'border-gray-600 text-gray-300 hover:bg-gray-600'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCalOpen((v) => !v)}
              className={`w-full mt-1 flex items-center gap-2 px-3 py-2 text-sm border rounded-lg outline-none ${
                isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
              }`}
            >
              <Calendar className="w-4 h-4 flex-shrink-0 opacity-70" />
              <span>{amountDate || '选择日期'}</span>
              <span className={`ml-auto ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{calOpen ? '收起' : '选择'}</span>
            </button>
            {calOpen && <MiniCalendar value={amountDate} onChange={(d) => setAmountDate(d)} isDarkMode={isDarkMode} />}
            {amountDate && amountDate !== message.created_at.slice(0, 10) && (
              <p className={`mt-1 text-sm ${isDarkMode ? 'text-amber-300' : 'text-amber-600'}`}>
                记账日 {amountDate} 与消息发送日 {message.created_at.slice(0, 10)} 不同（补账）
              </p>
            )}
          </div>

          {/* 分类 */}
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 flex-wrap">
                <span className={labelCls}>分类（可留空）</span>
                {/* 最近用过的分类快捷按钮（浏览器本地记录），点击直接选中 */}
                {quickCats.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCategory(n)}
                    title="最近使用"
                    className={`px-2 py-0.5 text-sm rounded-full border transition-colors ${
                      category === n
                        ? 'border-green-500 text-green-600'
                        : isDarkMode
                          ? 'border-gray-600 text-gray-300 hover:bg-gray-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void addCategory()}
                className={`flex items-center gap-0.5 text-sm ${isDarkMode ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'}`}
              >
                <Plus className="w-3.5 h-3.5" />
                新增分类
              </button>
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`w-full mt-1 px-3 py-2 text-sm border rounded-lg outline-none ${
                isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
              }`}
            >
              <option value="">（未分类）</option>
              {sideCats.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {catsLoading && (
              <p className={`mt-1 text-sm flex items-center gap-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />分类加载中…
              </p>
            )}
          </div>

          {inheritHint && (
            <p className={`text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>已自动继承原消息的分类：{inheritHint}</p>
          )}

          {/* 预览：常驻占位（未输入有效金额时显示灰字），避免输入/清空时弹窗高度跳动 */}
          <div className={`rounded-lg px-3 py-2 text-sm ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
            {valid ? (
              <>
                将记为 <span className="font-medium">{opt.label}</span> <span className="font-medium">¥{fmtMoney(cents)}</span>
                {category.trim() && <> · {category.trim()}</>}
                {opt.sign === -1 && <span className="opacity-80">（抵减，不计入{moneySideLabel(opt.kind)}）</span>}
              </>
            ) : (
              <span className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}>将记为：输入金额后显示预览</span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            {hasAmount && (
              <button
                onClick={() => void clear()}
                disabled={saving}
                className="mr-auto flex items-center gap-1 px-3 py-2 text-sm rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                清除记账
              </button>
            )}
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm rounded-lg ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              取消
            </button>
            <button
              onClick={() => void save()}
              disabled={saving || !valid}
              className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
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

const moneySideLabel = (kind: 1 | 2) => (kind === 1 ? '支出' : '收入');
