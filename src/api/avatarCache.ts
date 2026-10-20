// 头像本地缓存：localStorage 按 userId 存 dataURL 和版本号
// 服务端只在 avatar_ver 变化时才返回头像数据，配合此缓存把头像流量降到最低

const KEY_DATA = (id: number) => `sc_avatar_${id}`;
const KEY_VER = (id: number) => `sc_avatarver_${id}`;

export function getCachedAvatar(userId: number): string | null {
  try {
    return localStorage.getItem(KEY_DATA(userId));
  } catch {
    return null;
  }
}

export function getCachedAvatarVer(userId: number): number {
  try {
    return parseInt(localStorage.getItem(KEY_VER(userId)) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

export function setCachedAvatar(userId: number, ver: number, dataUrl: string): void {
  try {
    localStorage.setItem(KEY_DATA(userId), dataUrl);
    localStorage.setItem(KEY_VER(userId), String(ver));
  } catch {
    // localStorage 满时静默失败，下次还会按版本号重新拉
  }
}

// 仅更新版本号（已知数据没变时同步本地 ver，避免重复请求）
export function setCachedAvatarVer(userId: number, ver: number): void {
  try {
    localStorage.setItem(KEY_VER(userId), String(ver));
  } catch {
    /* ignore */
  }
}
