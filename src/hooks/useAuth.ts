import { useState, useEffect, useCallback } from 'react';
import { api, tokenStore, onUnauthorized } from '../api/client';
import { User } from '../api/types';
import { currentDeviceName } from '../config';
import { clearMsgCache } from '../api/msgCache';

export interface AuthResult {
  success: boolean;
  message: string;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(() => tokenStore.getUser());
  const [isLoading, setIsLoading] = useState(true);

  // 启动时用 token 向服务器核验身份
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const token = tokenStore.get();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const { user: fresh } = await api.me();
        if (!cancelled) {
          setUser(fresh);
          tokenStore.setUser(fresh);
        }
      } catch {
        // 401 时 client 已清除 token；网络错误时保留本地登录态，允许离线查看
        if (!cancelled && tokenStore.get() === null) {
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // 任意请求遇到 401 → 退出登录
  useEffect(() => {
    onUnauthorized(() => setUser(null));
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      try {
        const data = await api.login({
          username,
          password,
          device_name: currentDeviceName(),
        });
        tokenStore.set(data.token);
        tokenStore.setUser(data.user);
        setUser(data.user);
        return { success: true, message: '登录成功' };
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : '登录失败' };
      }
    },
    [],
  );

  const register = useCallback(
    async (
      username: string,
      password: string,
      inviteCode: string,
      nickname?: string,
    ): Promise<AuthResult> => {
      try {
        await api.register({ username, password, invite_code: inviteCode, nickname });
        // 注册成功后自动登录
        return login(username, password);
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : '注册失败' };
      }
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // 即使接口失败也要清除本地状态
    }
    tokenStore.clear();
    // 登出清空本地消息缓存，避免残留上一账号的聊天内容
    void clearMsgCache();
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (data: {
      nickname?: string;
      color?: string;
      signature?: string;
      oldPassword?: string;
      newPassword?: string;
    }): Promise<AuthResult> => {
      try {
        const payload: {
          nickname?: string;
          color?: string;
          signature?: string;
          old_password?: string;
          new_password?: string;
        } = {};
        if (data.nickname !== undefined) payload.nickname = data.nickname;
        if (data.color !== undefined) payload.color = data.color;
        if (data.signature !== undefined) payload.signature = data.signature;
        if (data.newPassword) {
          payload.old_password = data.oldPassword;
          payload.new_password = data.newPassword;
        }
        const { user: fresh } = await api.updateProfile(payload);
        setUser(fresh);
        tokenStore.setUser(fresh);
        return { success: true, message: '已保存' };
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : '保存失败' };
      }
    },
    [],
  );

  // 头像上传成功后同步本地用户信息的版本号（触发各处 Avatar 组件刷新）
  const setUserAvatarVer = useCallback((ver: number) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, avatar_ver: ver };
      tokenStore.setUser(next);
      return next;
    });
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    updateProfile,
    setUserAvatarVer,
  };
};
