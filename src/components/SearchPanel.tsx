import { useMemo, useRef, useState } from 'react';
import { X, Search, Loader2, Users } from 'lucide-react';
import { api } from '../api/client';
import { Group, SearchResult } from '../api/types';

interface Props {
  currentGroupId: number | null;
  currentGroupName: string;
  groups: Group[]; // 群搜索模式的数据源（name/description/remark 已含在 groups.list 返回中）
  isDarkMode: boolean;
  onJump: (groupId: number) => void;
  onClose: () => void;
  defaultScopeAll?: boolean;
  // 默认搜索模式：侧栏顶部搜索按钮进来默认「找群」，聊天头部搜索进来默认「搜消息」
  defaultMode?: 'group' | 'message';
}

// 转义正则特殊字符
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 关键词高亮
const Highlight = ({ text, keyword }: { text: string; keyword: string }) => {
  const k = keyword.trim();
  if (!k) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(k)})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === k.toLowerCase() ? (
          <mark key={i} className="bg-yellow-300 text-gray-900 rounded px-0.5">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
};

// 搜索面板（右侧抽屉）：「找群」按群名/群说明/群备注定位会话；「搜消息」为原聊天记录搜索
export const SearchPanel = ({ currentGroupId, currentGroupName, groups, isDarkMode, onJump, onClose, defaultScopeAll = false, defaultMode = 'message' }: Props) => {
  const [mode, setMode] = useState<'group' | 'message'>(defaultMode);
  const [keyword, setKeyword] = useState('');
  const [scopeAll, setScopeAll] = useState(defaultScopeAll);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 清空搜索框与结果，方便直接输入下一个关键词
  const clearKeyword = () => {
    setKeyword('');
    setResults([]);
    setHasMore(false);
    setSearched(false);
    inputRef.current?.focus();
  };

  // 找群：实时过滤（群名/群说明/群备注，私聊额外匹配对方昵称；不区分大小写）
  const kw = keyword.trim().toLowerCase();
  const matchedGroups = useMemo(() => {
    if (!kw) return [];
    return groups.filter((g) => {
      const peer = g.is_dm === 1 ? g.dm_peer?.nickname ?? '' : '';
      return [g.name, g.description, g.remark, peer].some((f) => f.toLowerCase().includes(kw));
    });
  }, [groups, kw]);

  // 每个命中群实际匹配到哪些字段（用于摘要显示）
  const matchedFieldsOf = (g: Group): { label: string; text: string }[] => {
    const out: { label: string; text: string }[] = [];
    if (g.name.toLowerCase().includes(kw)) out.push({ label: '群名', text: g.name });
    if (g.description.toLowerCase().includes(kw)) out.push({ label: '说明', text: g.description });
    if (g.remark.toLowerCase().includes(kw)) out.push({ label: '备注', text: g.remark });
    const peer = g.is_dm === 1 ? g.dm_peer?.nickname ?? '' : '';
    if (peer && peer.toLowerCase().includes(kw)) out.push({ label: '对方', text: peer });
    return out;
  };

  const doSearch = async (beforeId: number, append: boolean, all = scopeAll) => {
    const k = keyword.trim();
    if (!k || loading) return;
    setLoading(true);
    try {
      const { messages, has_more } = await api.messagesSearch(k, all ? 0 : (currentGroupId ?? 0), beforeId);
      setResults((prev) => (append ? [...prev, ...messages] : messages));
      setHasMore(has_more === 1);
      setSearched(true);
    } catch {
      // 网络波动忽略
    } finally {
      setLoading(false);
    }
  };

  const switchScope = (all: boolean) => {
    setScopeAll(all);
    setResults([]);
    setSearched(false);
    if (keyword.trim()) void doSearch(0, false, all);
  };

  // 切换 找群/搜消息：保留关键词；消息结果清空待重新回车搜索
  const switchMode = (m: 'group' | 'message') => {
    if (m === mode) return;
    setMode(m);
    setResults([]);
    setHasMore(false);
    setSearched(false);
    inputRef.current?.focus();
  };

  // 点群结果：跳到该会话并清空搜索（onJump 里会关闭面板）
  const jumpGroup = (gid: number) => {
    setKeyword('');
    onJump(gid);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black bg-opacity-40" />
      <div
        className={`relative w-full sm:w-96 h-full flex flex-col shadow-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-4 border-b flex-shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>搜索</h2>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`p-3 border-b flex-shrink-0 ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className={`flex items-center space-x-2 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (mode === 'group') {
                  // 找群：回车直接进入第一个匹配结果
                  if (matchedGroups.length > 0) jumpGroup(matchedGroups[0].id);
                } else {
                  void doSearch(0, false);
                }
              }}
              placeholder={mode === 'group' ? '输入群名 / 群说明 / 群备注' : '输入关键词，回车搜索'}
              autoFocus
              className={`flex-1 bg-transparent outline-none text-sm ${isDarkMode ? 'text-white placeholder-gray-400' : 'text-gray-800'}`}
            />
            {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
            {keyword.length > 0 && (
              <button
                onClick={clearKeyword}
                className={`p-0.5 rounded-full flex-shrink-0 ${
                  isDarkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
                }`}
                title="清空"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* 找群 / 搜消息 切换 */}
          <div className="flex items-center space-x-2 mt-2 px-1">
            <button
              onClick={() => switchMode('group')}
              className={`px-2.5 py-1 text-sm rounded-full transition-colors ${
                mode === 'group'
                  ? 'bg-green-500 text-white'
                  : isDarkMode
                    ? 'bg-gray-700 text-gray-300'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              找群
            </button>
            <button
              onClick={() => switchMode('message')}
              className={`px-2.5 py-1 text-sm rounded-full transition-colors ${
                mode === 'message'
                  ? 'bg-green-500 text-white'
                  : isDarkMode
                    ? 'bg-gray-700 text-gray-300'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              搜消息
            </button>
          </div>
          {mode === 'message' && (
          <div className="flex items-center space-x-2 mt-2 px-1">
            <button
              onClick={() => switchScope(false)}
              className={`px-2.5 py-1 text-sm rounded-full transition-colors ${
                !scopeAll
                  ? 'bg-green-500 text-white'
                  : isDarkMode
                    ? 'bg-gray-700 text-gray-300'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              当前群{currentGroupName ? `「${currentGroupName}」` : ''}
            </button>
            <button
              onClick={() => switchScope(true)}
              className={`px-2.5 py-1 text-sm rounded-full transition-colors ${
                scopeAll
                  ? 'bg-green-500 text-white'
                  : isDarkMode
                    ? 'bg-gray-700 text-gray-300'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              全部群聊
            </button>
          </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {mode === 'group' ? (
            !kw ? (
              <p className="text-sm text-gray-400 text-center py-10">输入群名、群说明或群备注，实时查找群聊</p>
            ) : matchedGroups.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">没有匹配的群聊</p>
            ) : (
              matchedGroups.map((g) => {
                const name = g.is_dm === 1 && g.dm_peer ? g.dm_peer.nickname : g.remark || g.name;
                return (
                  <button
                    key={g.id}
                    onClick={() => jumpGroup(g.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-colors ${
                      isDarkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-100'
                    }`}
                  >
                    <p className="flex items-center mb-0.5">
                      <Users className="w-4 h-4 text-green-500 flex-shrink-0 mr-1.5" />
                      <span className={`font-medium text-sm truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                        <Highlight text={name} keyword={keyword} />
                      </span>
                      <span className="text-sm text-gray-400 flex-shrink-0 ml-auto pl-2">
                        {g.is_dm === 1 ? '私聊' : `${g.member_count} 位成员`}
                      </span>
                    </p>
                    {matchedFieldsOf(g)
                      .filter((f) => f.text !== name || f.label !== '群名')
                      .slice(0, 2)
                      .map((f) => (
                        <p key={f.label} className="text-sm text-gray-400 truncate mt-0.5">
                          {f.label}：<Highlight text={f.text} keyword={keyword} />
                        </p>
                      ))}
                    <p className="text-sm text-gray-400 mt-0.5">点击进入会话</p>
                  </button>
                );
              })
            )
          ) : searched && results.length === 0 && !loading ? (
            <p className="text-sm text-gray-400 text-center py-10">没有找到相关消息</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => onJump(r.group_id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-colors ${
                  isDarkMode ? 'hover:bg-gray-700/60' : 'hover:bg-gray-100'
                }`}
              >
                <p className="flex items-center justify-between mb-0.5">
                  <span className="font-medium text-sm" style={{ color: r.color }}>{r.nickname}</span>
                  <span className="text-xs text-gray-400">{r.created_at.slice(5, 16)}</span>
                </p>
                <p className={`text-sm break-words line-clamp-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <Highlight text={r.content} keyword={keyword} />
                </p>
                {scopeAll && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    来自{r.is_dm === 1 ? '私聊' : '群聊'}「{r.group_name}」· 点击跳转
                  </p>
                )}
              </button>
            ))
          )}
          {mode === 'message' && hasMore && (
            <button
              onClick={() => void doSearch(results[results.length - 1]?.id ?? 0, true)}
              disabled={loading}
              className={`w-full py-2 text-sm rounded-xl transition-colors ${
                isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
              } disabled:opacity-60`}
            >
              {loading ? '加载中…' : '加载更多'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
