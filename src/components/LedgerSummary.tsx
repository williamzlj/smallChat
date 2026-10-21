import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Wallet, X, Loader2, RefreshCw, Inbox, Trash2, Plus, Settings2, ChevronLeft, ChevronRight, Calendar, Download,
} from 'lucide-react';
import { api } from '../api/client';
import { Category, LedgerData, LedgerDetail, LedgerDetailRow, LedgerMonthRow } from '../api/types';
import { fmtMoney } from './MessageBubble';
import { MiniCalendar } from './MiniCalendar';

interface Props {
  isDarkMode: boolean;
  fontSize: number;
  groupId: number;
  groupName: string;
  onJump: (groupId: number, msgId: number) => void; // 点明细记录 → 关闭本弹窗并跳到聊天里该条消息
  onClose: () => void;
}

type Preset = 'month0' | 'month1' | 'year0' | 'm3' | 'm12' | 'all';
type RangeKey = Preset | 'custom';

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month0', label: '本月' },
  { key: 'month1', label: '上月' },
  { key: 'year0', label: '今年' },
  { key: 'm3', label: '近3月' },
  { key: 'm12', label: '近12月' },
  { key: 'all', label: '全部' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const fmtD = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// 纯日期字符串 ↔ Date 分量：不使用 new Date('YYYY-MM-DD') 解析（会按 UTC 解释产生偏移）
const splitD = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
// 日期加减天数（用 Date 分量做日历运算，安全）
const shiftD = (s: string, days: number) => {
  const p = splitD(s);
  if (!p) return s;
  const d = new Date(p.y, p.m - 1, p.d + days);
  return fmtD(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
const todayStr = () => {
  const n = new Date();
  return fmtD(n.getFullYear(), n.getMonth() + 1, n.getDate());
};
const monthFirst = (d: Date) => fmtD(d.getFullYear(), d.getMonth() + 1, 1);

// 预设 → 区间（后端 to 不含边界，故取下月/下年一号；to 留空 = 至今）
function rangeOf(preset: Preset): { from?: string; to?: string } {
  const now = new Date();
  const shift = (n: number) => new Date(now.getFullYear(), now.getMonth() + n, 1);
  switch (preset) {
    case 'all':
      return {};
    case 'month0':
      return { from: monthFirst(shift(0)), to: monthFirst(shift(1)) };
    case 'month1':
      return { from: monthFirst(shift(-1)), to: monthFirst(shift(0)) };
    case 'year0':
      return { from: `${now.getFullYear()}-01-01` }; // 今年 1 月 1 日 至今
    case 'm3':
      return { from: monthFirst(shift(-2)), to: monthFirst(shift(1)) };
    default:
      return { from: monthFirst(shift(-11)), to: monthFirst(shift(1)) };
  }
}

// 带符号的金额文本（区分「抵减」与「新增」）
const money = (cents: number) => `${cents < 0 ? '-' : ''}¥${fmtMoney(cents)}`;

// 明细金额配色（1=支出侧 2=收入侧；负数为抵减）
const amountCls = (kind: number, cents: number, isDarkMode: boolean) => {
  if (kind === 1) return cents < 0 ? (isDarkMode ? 'text-rose-300' : 'text-rose-500') : isDarkMode ? 'text-red-300' : 'text-red-600';
  return cents < 0 ? (isDarkMode ? 'text-emerald-300' : 'text-emerald-600') : isDarkMode ? 'text-green-300' : 'text-green-600';
};

// 明细记录的摘要：图片/文件/转发不显示原始内容
const rowPreview = (r: LedgerDetailRow) =>
  r.type === 'image' ? '[图片]' : r.type === 'file' ? '[文件]' : r.type === 'forward' ? '[合并转发]' : r.content;

// 下钻目标：分类明细（kind + category + 当前范围）、某月明细（month）或某人明细（userId）
interface DetailTarget {
  title: string;
  kind: 0 | 1 | 2;
  category: string | null; // null=不限分类
  month?: string; // 指定月份（优先于当前范围）
  userId?: number; // 指定成员（按人统计下钻）
}

// 记账汇总弹窗：合计 + 分类统计 + 按人统计 + 按月汇总；分类/月份可点进去看明细
export const LedgerSummary = ({ isDarkMode, fontSize, groupId, groupName, onJump, onClose }: Props) => {
  const [rangeKey, setRangeKey] = useState<RangeKey>('month0');
  const [data, setData] = useState<LedgerData | null>(null);
  const [trend, setTrend] = useState<LedgerMonthRow[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [mgrOpen, setMgrOpen] = useState(false);

  // 自定义范围：draft=正在编辑的日期，custom=已应用（切换后不立即生效，需点「应用范围」）
  const [customOpen, setCustomOpen] = useState(false);
  const [calFor, setCalFor] = useState<'from' | 'to' | null>(null);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // 明细下钻
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [detailData, setDetailData] = useState<LedgerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 查询区间（自定义时，结束日期 +1 天转为后端的「不含边界」to）
  const range = useMemo(() => {
    if (rangeKey === 'custom') {
      return { from: customFrom || undefined, to: customTo ? shiftD(customTo, 1) : undefined };
    }
    return rangeOf(rangeKey);
  }, [rangeKey, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 汇总（按筛选范围）+ 全部月份的月度趋势（趋势需要跨月，故单独拉一次不限范围）
      const [d, t] = await Promise.all([
        api.messagesLedger(groupId, range),
        api.messagesLedger(groupId),
      ]);
      setData(d);
      setTrend(t.by_month);
    } catch (e) {
      alert(e instanceof Error ? e.message : '汇总加载失败');
    } finally {
      setLoading(false);
    }
  }, [groupId, range]);

  const loadCats = useCallback(async () => {
    try {
      const { categories } = await api.categoriesList(groupId);
      setCats(categories);
    } catch {
      // 静默
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadCats();
  }, [loadCats]);

  // 导出当前时间范围内的全部逐笔记录为 CSV（Excel 可直接打开）
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: LedgerDetailRow[] = [];
      let offset = 0;
      for (;;) {
        const r = await api.messagesLedgerDetail({
          group_id: groupId, kind: 0, from: range.from, to: range.to, limit: 300, offset,
        });
        all.push(...r.rows);
        if (r.has_more !== 1 || r.rows.length === 0) break;
        offset += r.rows.length;
      }
      const header = ['记账日期', '类型', '分类', '金额(元)', '摘要', '记账人', '消息日期'];
      const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const kindName = (r: LedgerDetailRow) =>
        r.amount_kind === 1 ? (r.amount_cents >= 0 ? '支出' : '退款') : r.amount_cents >= 0 ? '收入' : '收入调减';
      const lines = all.map((r) =>
        [r.ledger_date, kindName(r), r.amount_cat, (r.amount_cents / 100).toFixed(2), rowPreview(r), r.nickname, r.created_at.slice(0, 10)]
          .map(esc).join(','),
      );
      // ﻿ BOM 头，让 Excel 正确识别 UTF-8 编码
      const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = `${range.from ?? '全部'}_${range.to ?? ''}`.replace(/[^\d-]/g, '');
      a.href = url;
      a.download = `记账导出_${groupName.replace(/[\\/:*?"<>|]/g, '_')}_${stamp || '全部'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  // 加载明细（offset>0 为「加载更多」，追加到已有列表）
  const loadDetail = useCallback(
    async (t: DetailTarget, offset = 0) => {
      setDetailLoading(true);
      try {
        const p: Parameters<typeof api.messagesLedgerDetail>[0] = { group_id: groupId, kind: t.kind, limit: 100, offset };
        if (t.category !== null) p.category = t.category;
        if (t.userId) p.user_id = t.userId;
        if (t.month) {
          p.month = t.month;
        } else {
          if (range.from) p.from = range.from;
          if (range.to) p.to = range.to;
        }
        const d = await api.messagesLedgerDetail(p);
        setDetailData((prev) => (offset > 0 && prev ? { ...d, rows: [...prev.rows, ...d.rows] } : d));
      } catch (e) {
        alert(e instanceof Error ? e.message : '明细加载失败');
      } finally {
        setDetailLoading(false);
      }
    },
    [groupId, range],
  );

  useEffect(() => {
    if (!detail) {
      setDetailData(null);
      return;
    }
    setDetailData(null);
    void loadDetail(detail, 0);
  }, [detail, loadDetail]);

  // 按人汇总：把 (user, kind) 两行合成一行「支出 / 收入」
  const byUser = useMemo(() => {
    const map = new Map<number, { user_id: number; nickname: string; expense: number; income: number; count: number }>();
    for (const r of data?.by_user ?? []) {
      const row = map.get(r.user_id) ?? { user_id: r.user_id, nickname: r.nickname, expense: 0, income: 0, count: 0 };
      if (r.kind === 1) row.expense += r.total;
      else row.income += r.total;
      row.count += r.count;
      map.set(r.user_id, row);
    }
    return [...map.values()].sort((a, b) => Math.abs(b.expense) + Math.abs(b.income) - (Math.abs(a.expense) + Math.abs(a.income)));
  }, [data]);

  const addCategory = async (kind: 1 | 2) => {
    const name = window.prompt(`新增${kind === 1 ? '支出' : '收入'}分类名称（1~20 字）`, '');
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 20) {
      alert('分类名需 1~20 字');
      return;
    }
    try {
      await api.categoriesAdd(groupId, kind, trimmed);
      await loadCats();
    } catch (e) {
      alert(e instanceof Error ? e.message : '新增分类失败');
    }
  };

  // 删除分类只摘字典项，历史消息保留原分类字符串，故历史统计不受影响
  const delCategory = async (c: Category) => {
    if (!confirm(`确定删除分类「${c.name}」吗？\n已记账的历史消息仍保留该分类，统计不受影响。`)) return;
    try {
      await api.categoriesDelete(groupId, c.id);
      await loadCats();
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除分类失败');
    }
  };

  // 快捷时间段（近 N 天，含今天）直接应用
  const applyDays = (n: number) => {
    const to = todayStr();
    const from = shiftD(to, -(n - 1));
    setDraftFrom(from);
    setDraftTo(to);
    setCustomFrom(from);
    setCustomTo(to);
    setRangeKey('custom');
    setCalFor(null);
  };

  const applyCustom = () => {
    setCustomFrom(draftFrom);
    setCustomTo(draftTo);
    setRangeKey(draftFrom || draftTo ? 'custom' : 'all');
    setCalFor(null);
  };

  // 打开/收起自定义面板（首次打开时把已应用的日期同步到 draft）
  const toggleCustom = () => {
    setCustomOpen((v) => {
      if (!v) {
        setDraftFrom(customFrom);
        setDraftTo(customTo);
      }
      setCalFor(null);
      return !v;
    });
  };

  const sideRows = (kind: 1 | 2) => (data?.by_category ?? []).filter((r) => r.kind === kind);
  const sideTotal = (kind: 1 | 2) => (kind === 1 ? data?.totals.expense ?? 0 : data?.totals.income ?? 0);

  const cardCls = `rounded-xl px-3 py-2.5 ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`;
  const subCls = `text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;
  const sectionTitle = `text-base font-semibold mb-1.5 ${isDarkMode ? 'text-white' : 'text-gray-800'}`;
  const chipCls = `px-3 py-1.5 text-sm rounded-lg transition-colors`;
  const chipOff = isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200';
  const fieldCls = `w-full mt-1 flex items-center gap-2 px-3 py-2 text-sm rounded-lg border ${
    isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-700'
  }`;

  // 分类统计块（kind 侧）：每行可点击 → 看该分类的逐笔明细
  const catBlock = (kind: 1 | 2) => {
    const rows = sideRows(kind);
    const total = sideTotal(kind);
    // 条形以该侧最大单项为基准，便于直观比较各分类占比
    const denom = Math.max(...rows.map((r) => Math.abs(r.total)), 1);
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={`text-sm font-medium ${kind === 1 ? (isDarkMode ? 'text-red-300' : 'text-red-600') : isDarkMode ? 'text-green-300' : 'text-green-600'}`}>
            {kind === 1 ? '支出侧（含退款抵减）' : '收入侧（含调减抵减）'}
          </span>
          <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{money(total)}</span>
        </div>
        {rows.length === 0 ? (
          <p className={subCls}>该范围暂无记录</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => (
              <button
                key={`${r.kind}-${r.category}`}
                onClick={() =>
                  setDetail({
                    title: `${r.category || '（未分类）'} · ${kind === 1 ? '支出' : '收入'}明细`,
                    kind: r.kind as 1 | 2,
                    category: r.category,
                  })
                }
                title="点击查看该分类的逐笔明细"
                className={`block w-full text-left rounded-lg px-1 -mx-1 ${isDarkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-100'}`}
              >
                <div className="flex items-center justify-between gap-2" style={{ fontSize: `${Math.max(fontSize - 2, 14)}px` }}>
                  <span className="truncate flex items-center gap-1">
                    {r.category || '（未分类）'}
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                  </span>
                  <span className={`flex-shrink-0 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    {money(r.total)}
                    <span className={`ml-1.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{r.count}笔</span>
                  </span>
                </div>
                <div className={`mt-0.5 h-1.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <div
                    className={`h-full rounded-full ${kind === 1 ? 'bg-red-400' : 'bg-green-400'}`}
                    style={{ width: `${Math.min(100, (Math.abs(r.total) / denom) * 100)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] p-4" onClick={onClose}>
      <div
        className={`rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-4 border-b flex-shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`text-base font-bold flex items-center gap-1.5 min-w-0 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
            <Wallet className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <span className="truncate">记账汇总 · {groupName}</span>
          </h3>
          <div className="flex items-center flex-shrink-0">
            <button
              onClick={() => void load()}
              className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
              title="刷新"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {detail ? (
            /* ========== 明细视图（点分类 / 月份下钻） ========== */
            <>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDetail(null)}
                  className={`flex items-center gap-1 px-2 py-1 text-sm rounded-lg flex-shrink-0 ${
                    isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  title="返回汇总"
                >
                  <ChevronLeft className="w-5 h-5" />
                  返回
                </button>
                <span className={`text-base font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{detail.title}</span>
                {detailData && (
                  <span className={`ml-auto flex-shrink-0 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    {money(detailData.total)}
                    <span className={`ml-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{detailData.count}笔</span>
                  </span>
                )}
              </div>

              {detailLoading && !detailData ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : detailData && detailData.rows.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-10 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Inbox className="w-10 h-10 mb-2" />
                  <p className="text-sm">该范围没有明细记录</p>
                </div>
              ) : (
                <div className={`rounded-xl overflow-hidden border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  {detailData?.rows.map((r, i) => (
                    <button
                      key={r.id}
                      onClick={() => onJump(groupId, r.id)}
                      title="跳到聊天中的这条消息"
                      className={`block w-full text-left px-3 py-2 flex items-start gap-2 ${
                        i > 0 ? (isDarkMode ? 'border-t border-gray-700' : 'border-t border-gray-100') : ''
                      } ${isDarkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-50'}`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className={`block truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`} style={{ fontSize: `${Math.max(fontSize - 2, 14)}px` }}>
                          {rowPreview(r) || '（无文本内容）'}
                        </span>
                        <span className={`block ${subCls}`}>
                          {r.ledger_date} · {r.nickname || '（未知用户）'}
                          {!detail.month && r.amount_cat ? ` · ${r.amount_cat}` : ''}
                        </span>
                      </span>
                      <span className={`flex-shrink-0 font-medium ${amountCls(r.amount_kind, r.amount_cents, isDarkMode)}`} style={{ fontSize: `${Math.max(fontSize - 2, 14)}px` }}>
                        {money(r.amount_cents)}
                      </span>
                    </button>
                  ))}
                  {detailData?.has_more === 1 && (
                    <button
                      onClick={() => void loadDetail(detail, detailData.rows.length)}
                      disabled={detailLoading}
                      className={`w-full py-2 text-sm ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'} ${
                        isDarkMode ? 'border-t border-gray-700' : 'border-t border-gray-100'
                      }`}
                    >
                      {detailLoading ? '加载中…' : '加载更多'}
                    </button>
                  )}
                </div>
              )}
              <p className={subCls}>点击某条记录可跳到聊天中的该消息</p>
            </>
          ) : (
            /* ========== 汇总视图 ========== */
            <>
              {/* 时间范围 */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => {
                        setRangeKey(p.key);
                        setCalFor(null);
                      }}
                      className={`${chipCls} ${rangeKey === p.key ? 'bg-green-500 text-white' : chipOff}`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    onClick={toggleCustom}
                    className={`${chipCls} flex items-center gap-1 ${
                      rangeKey === 'custom' ? 'bg-green-500 text-white' : customOpen ? (isDarkMode ? 'bg-gray-600 text-gray-100' : 'bg-gray-200 text-gray-700') : chipOff
                    }`}
                    title="选择自定义起止日期"
                  >
                    <Calendar className="w-4 h-4" />
                    自定义
                  </button>
                </div>

                {/* 自定义范围面板 */}
                {customOpen && (
                  <div className={`rounded-xl border p-3 space-y-2 ${isDarkMode ? 'border-gray-600 bg-gray-700/30' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={subCls}>快捷：</span>
                      {[7, 30, 90].map((n) => (
                        <button key={n} onClick={() => applyDays(n)} className={`${chipCls} ${chipOff}`}>
                          近{n}天
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([['from', '起始日期', draftFrom, setDraftFrom], ['to', '结束日期（含当天）', draftTo, setDraftTo]] as const).map(
                        ([key, label, val, set]) => (
                          <div key={key}>
                            <span className={subCls}>{label}</span>
                            <button onClick={() => setCalFor(calFor === key ? null : key)} className={fieldCls}>
                              <Calendar className="w-4 h-4 flex-shrink-0 opacity-70" />
                              <span>{val || '不限'}</span>
                              <span className={`ml-auto text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {calFor === key ? '收起' : '选择'}
                              </span>
                            </button>
                            {calFor === key && (
                              <MiniCalendar value={val} onChange={(d) => set(d)} isDarkMode={isDarkMode} />
                            )}
                          </div>
                        ),
                      )}
                    </div>
                    <p className={subCls}>只填起始日期 = 该日期起至今；只填结束日期 = 该日期以前（含当天）</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={applyCustom} className="px-3 py-1.5 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600">
                        应用范围
                      </button>
                      <button
                        onClick={() => {
                          setDraftFrom('');
                          setDraftTo('');
                          setCalFor(null);
                        }}
                        className={`${chipCls} ${chipOff}`}
                      >
                        清空日期
                      </button>
                      {rangeKey === 'custom' && (
                        <span className={subCls}>
                          当前范围：{customFrom || '不限'} ~ {customTo || '至今'}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {data && (
                  <p className={subCls}>
                    范围：{data.range.from ? data.range.from.slice(0, 10) : '不限'} ~ {data.range.to ? shiftD(data.range.to, -1) : '至今'}
                  </p>
                )}
              </div>

              {loading && !data ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : data ? (
                <>
                  {data.totals.count === 0 ? (
                    <div className={`flex flex-col items-center justify-center py-8 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      <Inbox className="w-12 h-12 mb-2" />
                      <p className="text-sm">该范围还没有记账记录</p>
                      <p className={`text-sm mt-1 ${subCls}`}>在聊天里右键消息 →「记账」，即可记下金额与分类</p>
                    </div>
                  ) : (
                    <>
                      {/* 合计卡片 */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className={cardCls}>
                          <p className={subCls}>支出合计</p>
                          <p className={`text-base font-bold ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>{money(data.totals.expense)}</p>
                        </div>
                        <div className={cardCls}>
                          <p className={subCls}>收入合计</p>
                          <p className={`text-base font-bold ${isDarkMode ? 'text-green-300' : 'text-green-600'}`}>{money(data.totals.income)}</p>
                        </div>
                        <div className={cardCls}>
                          <p className={subCls}>结余（收入-支出）</p>
                          <p className={`text-base font-bold ${data.totals.net >= 0 ? (isDarkMode ? 'text-green-300' : 'text-green-600') : isDarkMode ? 'text-red-300' : 'text-red-600'}`}>
                            {money(data.totals.net)}
                          </p>
                        </div>
                        <div className={cardCls}>
                          <p className={subCls}>记账笔数</p>
                          <p className={`text-base font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{data.totals.count}</p>
                        </div>
                      </div>

                      {/* 分类统计（点分类看明细） */}
                      <div>
                        <h4 className={sectionTitle}>分类统计</h4>
                        <div className="space-y-3">
                          {catBlock(1)}
                          {catBlock(2)}
                        </div>
                      </div>

                      {/* 按人统计 */}
                      {byUser.length > 0 && (
                        <div>
                          <h4 className={sectionTitle}>按人统计</h4>
                          <div className={`rounded-xl overflow-hidden border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                            {byUser.map((u, i) => (
                              <button
                                key={u.user_id}
                                onClick={() => setDetail({ title: `${u.nickname || '（未知用户）'} 的明细`, kind: 0, category: null, userId: u.user_id })}
                                title="点击查看该成员的逐笔明细"
                                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-inherit ${i > 0 ? (isDarkMode ? 'border-t border-gray-700' : 'border-t border-gray-100') : ''} ${
                                  isDarkMode ? 'bg-gray-700/40 hover:bg-gray-700/70' : 'bg-gray-50 hover:bg-gray-100'
                                }`}
                                style={{ fontSize: `${Math.max(fontSize - 2, 14)}px` }}
                              >
                                <span className="truncate min-w-0">{u.nickname || '（未知用户）'}</span>
                                <span className="flex-shrink-0">
                                  {u.expense !== 0 && <span className={isDarkMode ? 'text-red-300' : 'text-red-600'}>支出 {money(u.expense)}</span>}
                                  {u.expense !== 0 && u.income !== 0 && <span className="mx-1.5 opacity-40">|</span>}
                                  {u.income !== 0 && <span className={isDarkMode ? 'text-green-300' : 'text-green-600'}>收入 {money(u.income)}</span>}
                                  <span className={`ml-1.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{u.count}笔</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* 月度趋势（跨全部时间，不受上方范围影响；点某月看该月明细） */}
                  <div>
                    <h4 className={sectionTitle}>按月汇总（全部时间）</h4>
                    {trend.length === 0 ? (
                      <p className={subCls}>暂无数据</p>
                    ) : (
                      <div className={`rounded-xl overflow-hidden border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className={`grid grid-cols-[auto_1fr_1fr_1fr] gap-2 px-3 py-2 text-sm font-medium ${isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                          <span>月份</span>
                          <span className="text-right">支出</span>
                          <span className="text-right">收入</span>
                          <span className="text-right">结余</span>
                        </div>
                        {[...trend].reverse().map((m, i) => (
                          <button
                            key={m.month}
                            onClick={() => setDetail({ title: `${m.month} 明细`, kind: 0, category: null, month: m.month })}
                            title="点击查看该月明细"
                            className={`w-full grid grid-cols-[auto_1fr_1fr_1fr] gap-2 px-3 py-2 text-left text-xs text-inherit ${
                              i > 0 ? (isDarkMode ? 'border-t border-gray-700' : 'border-t border-gray-100') : ''
                            } ${isDarkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-50'}`}
                          >
                            <span className="whitespace-nowrap">{m.month}</span>
                            <span className={`text-right whitespace-nowrap ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>{money(m.expense)}</span>
                            <span className={`text-right whitespace-nowrap ${isDarkMode ? 'text-green-300' : 'text-green-600'}`}>{money(m.income)}</span>
                            <span className={`text-right whitespace-nowrap font-medium ${m.net >= 0 ? (isDarkMode ? 'text-gray-100' : 'text-gray-800') : isDarkMode ? 'text-red-300' : 'text-red-600'}`}>
                              {money(m.net)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 分类字典管理（每群一套独立字典；删除只摘字典项，不影响历史统计） */}
                  <div>
                    <button
                      onClick={() => setMgrOpen(!mgrOpen)}
                      className={`flex items-center gap-1.5 text-sm ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                      <Settings2 className="w-4 h-4" />
                      {mgrOpen ? '收起分类字典管理' : '分类字典管理'}
                    </button>
                    {mgrOpen && (
                      <div className="mt-2 space-y-3">
                        {([1, 2] as const).map((kind) => (
                          <div key={kind}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={subCls}>{kind === 1 ? '支出分类' : '收入分类'}</span>
                              <button
                                onClick={() => void addCategory(kind)}
                                className={`flex items-center gap-0.5 text-sm ${isDarkMode ? 'text-green-400 hover:text-green-300' : 'text-green-600 hover:text-green-700'}`}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                新增
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {cats.filter((c) => c.kind === kind).length === 0 ? (
                                <span className={subCls}>暂无分类</span>
                              ) : (
                                cats
                                  .filter((c) => c.kind === kind)
                                  .map((c) => (
                                    <span
                                      key={c.id}
                                      className={`flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-sm ${
                                        isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'
                                      }`}
                                    >
                                      {c.name}
                                      <button
                                        onClick={() => void delCategory(c)}
                                        className={`p-0.5 rounded-full ${isDarkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                                        title="删除该分类（历史统计不受影响）"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </span>
                                  ))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 导出财务记录（按当前所选时间范围） */}
                  <div className={`pt-3 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <button
                      onClick={() => void exportCsv()}
                      disabled={exporting}
                      className={`flex items-center gap-1.5 text-sm ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-800'} disabled:opacity-50`}
                    >
                      {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {exporting ? '正在导出…' : '导出财务记录（CSV）'}
                    </button>
                    <p className={`${subCls} mt-1`}>按当前所选时间范围导出全部逐笔记录，可用 Excel 打开</p>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
