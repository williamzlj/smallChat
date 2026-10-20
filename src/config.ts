// 全局配置

// 后端接口基址（景安虚拟主机 /smallChat 目录，必须 HTTPS）
export const API_BASE = 'https://dz.zhangliangjun.cn/smallChat';

// 轮询间隔（毫秒）
export const POLL_INTERVAL = 4000;

// 每次进入群聊拉取的最近消息条数
export const INITIAL_MSG_LIMIT = 100;

// 向上翻历史每次条数
export const HISTORY_LIMIT = 50;

// 图片发送前压缩的最大宽度（超过则等比缩小；服务端 api.php 同样强制限宽 900）
export const IMAGE_MAX_WIDTH = 900;
// 图片压缩质量
export const IMAGE_QUALITY = 0.8;
// 超过该大小（KB）的图片才压缩
export const IMAGE_COMPRESS_THRESHOLD_KB = 400;

// 拼接附件完整地址（后端返回的是 uploads/xxx 相对路径）
export function fileUrl(relativeUrl: string): string {
  return `${API_BASE}/${relativeUrl.replace(/^\//, '')}`;
}

// 生成当前设备名（用于登录设备管理）
export function currentDeviceName(): string {
  const ua = navigator.userAgent;
  let os = '未知设备';
  if (/Windows NT 10/.test(ua)) os = 'Windows';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) {
    const m = ua.match(/Android\s([\d.]+)/);
    os = `Android${m ? ' ' + m[1] : ''}`;
  } else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let browser = '';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  return `${os} ${browser}`.trim();
}
