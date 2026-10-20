import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { getCachedAvatar, getCachedAvatarVer, setCachedAvatar, setCachedAvatarVer } from '../api/avatarCache';

interface AvatarProps {
  userId: number;
  nickname: string;
  color: string;
  avatarVer: number; // 服务端版本号，0=未设置头像
  size?: number; // 像素边长，默认 36
  className?: string;
  onClick?: () => void;
}

// 用户头像：有上传头像显示图片，否则显示昵称首字+底色圆形
// 缓存策略：localStorage 存 dataURL+ver，仅当传入 avatarVer 比本地新时才请求服务器
export const Avatar = ({ userId, nickname, color, avatarVer, size = 36, className = '', onClick }: AvatarProps) => {
  const [dataUrl, setDataUrl] = useState<string | null>(() => getCachedAvatar(userId));
  const fetchingRef = useRef(false);

  useEffect(() => {
    const localVer = getCachedAvatarVer(userId);
    // 本地缓存已是最新，或对方没有头像（ver=0），无需请求
    if (avatarVer <= 0 || avatarVer <= localVer || fetchingRef.current) return;
    fetchingRef.current = true;
    api
      .getAvatar(userId, localVer)
      .then((r) => {
        if (r.changed && r.avatar) {
          const url = r.avatar.startsWith('data:') ? r.avatar : `data:image/jpeg;base64,${r.avatar}`;
          setCachedAvatar(userId, r.avatar_ver, url);
          setDataUrl(url);
        } else {
          setCachedAvatarVer(userId, avatarVer);
        }
      })
      .catch(() => {
        /* 网络失败下次再试 */
      })
      .finally(() => {
        fetchingRef.current = false;
      });
  }, [userId, avatarVer]);

  const style: React.CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt={nickname}
        style={style}
        onClick={onClick}
        className={`rounded-full object-cover flex-shrink-0 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
        draggable={false}
      />
    );
  }
  return (
    <div
      style={{ ...style, backgroundColor: color }}
      onClick={onClick}
      className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {nickname.slice(0, 1).toUpperCase()}
    </div>
  );
};
