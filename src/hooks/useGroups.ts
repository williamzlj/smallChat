import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { Group } from '../api/types';

// 我的群组列表
export const useGroups = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { groups: list } = await api.groupsList();
      setGroups(list);
    } catch (e) {
      // 静默失败（网络波动时保留下次重试）
      console.warn('刷新群列表失败', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // 低频轮询，接收"被拉群/群名变更"等变化
    timerRef.current = setInterval(refresh, 15000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  const create = useCallback(
    async (name: string) => {
      const { id } = await api.groupsCreate(name);
      await refresh();
      return id;
    },
    [refresh],
  );

  const rename = useCallback(
    async (groupId: number, name: string) => {
      await api.groupsRename(groupId, name);
      await refresh();
    },
    [refresh],
  );

  const invite = useCallback(
    async (groupId: number, username: string) => {
      await api.groupsInvite(groupId, username);
    },
    [],
  );

  const leave = useCallback(
    async (groupId: number) => {
      await api.groupsLeave(groupId);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (groupId: number) => {
      await api.groupsDelete(groupId);
      await refresh();
    },
    [refresh],
  );

  return { groups, loading, refresh, create, rename, invite, leave, remove };
};
