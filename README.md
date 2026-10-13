# smallChat

> 多设备信息同步工具 — 替代"微信群当笔记"，按类别分群管理短文本、长文本、图片和文件附件。

English · [中文](#中文)

---

## Features

- **Multi-device sync** — 2 laptops + 2 phones stay in sync via polling incremental protocol (`since_id`).
- **Categorized groups** — separate groups for accounting, work notes, life logs, etc.
- **Rich messages** — short text, long text, images (auto-compressed to 1280px), file attachments.
- **Invite-code registration** — only authorized devices can register, keeping public users out.
- **Token auth** — `X-Auth-Token` header (30-day validity), with multi-device session management.
- **Soft delete** — messages are append-only; deletions set `deleted=1` to avoid sync conflicts.
- **PWA** — installable, offline-capable, with service worker caching.
- **Dark mode & adjustable font size** — accessibility-first UI.
- **Long-press to todo** — long-press any message to convert it into a todo item.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind CSS + PWA |
| Backend | PHP 7.4 + SQLite (single-entry `api.php`) |
| Storage | SQLite for metadata, server directory for uploads |
| Deploy | Frontend on GitHub Pages, backend on shared PHP host |

## Requirements

- Node.js 18+ (for frontend build)
- A PHP 7.4+ host with PDO_SQLITE and `mod_rewrite`-equivalent (Apache `.htaccess` optional)
- HTTPS certificate (frontend uses HTTPS API; HTTP requests are rejected with 426)

## Quick Start

### Frontend (this repo)

```bash
npm install
npm run dev        # local dev at http://localhost:5173
npm run build      # production build to dist/
```

Configure the backend URL in `src/config.ts`:

```ts
export const API_BASE = 'https://your-host/smallChat';
```

### Backend

The PHP backend (`api.php` + helpers) lives outside this repo. Deploy it to a PHP host with these endpoints:

- `ping` · `register` (invite code) · `login` · `logout` · `me` · `user.update`
- `tokens.list` · `tokens.revoke` (device session management)
- `groups.list` · `groups.create` · `groups.rename` · `groups.invite` · `groups.members` · `groups.leave` · `groups.delete`
- `messages.send` · `messages.list` · `messages.history` · `messages.delete`
- `upload` (multipart `file` field, returns `file_id` + `url`)

Auth uses the `X-Auth-Token` header (Apache may strip `Authorization`). Polling fetches `messages.list?group_id&since_id=N&limit=...`.

## Live Demo

- App: <https://williamzlj.github.io/smallChat/>
- API: <https://dz.zhangliangjun.cn/smallChat/api.php?action=ping>

Registration requires an invite code; contact the maintainer to get one.

## License

[MIT](./LICENSE)

---

<a id="中文"></a>

# smallChat（中文）

> 多设备信息同步工具 — 替代"微信群当笔记"，按类别分群管理短文本、长文本、图片和文件附件。

[English](#smallChat) · 中文

---

## 功能特性

- **多设备同步** — 2 台笔记本 + 2 部手机通过轮询增量协议（`since_id`）保持同步。
- **分类群组** — 记账、工作备忘、生活记录等按类别分群存储。
- **富消息** — 短文本、长文本、图片（自动压缩至 1280px 宽）、文件附件。
- **邀请码注册** — 仅授权设备可注册，防止外部用户进入。
- **令牌鉴权** — `X-Auth-Token` 请求头（30 天有效），支持多设备会话管理。
- **软删除** — 消息只增不改，删除时置 `deleted=1`，避免多设备同步冲突。
- **PWA** — 可安装、可离线，Service Worker 缓存静态资源。
- **深色模式与字号调节** — 注重可访问性的界面设计。
- **长按转待办** — 长按任意消息可将其转为待办事项。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite 5 + Tailwind CSS + PWA |
| 后端 | PHP 7.4 + SQLite（单入口 `api.php`） |
| 存储 | SQLite 存元数据，服务器目录存上传文件 |
| 部署 | 前端在 GitHub Pages，后端在 PHP 虚拟主机 |

## 环境要求

- Node.js 18+（前端构建）
- PHP 7.4+ 主机，支持 PDO_SQLITE（无需 `.htaccess`，后端兼容 Apache 剥离 Authorization 头的情况）
- HTTPS 证书（前端调用 HTTPS API；明文 HTTP 请求会被后端以 426 拒绝）

## 快速开始

### 前端（本仓库）

```bash
npm install
npm run dev        # 本地开发，地址 http://localhost:5173
npm run build      # 生产构建，产物在 dist/
```

后端地址在 `src/config.ts` 配置：

```ts
export const API_BASE = 'https://your-host/smallChat';
```

### 后端

PHP 后端（`api.php` + 辅助文件）不在本仓库内。部署到 PHP 主机后提供以下接口：

- `ping` · `register`（邀请码）· `login` · `logout` · `me` · `user.update`
- `tokens.list` · `tokens.revoke`（设备会话管理）
- `groups.list` · `groups.create` · `groups.rename` · `groups.invite` · `groups.members` · `groups.leave` · `groups.delete`
- `messages.send` · `messages.list` · `messages.history` · `messages.delete`
- `upload`（multipart 字段名 `file`，返回 `file_id` + `url`）

鉴权使用 `X-Auth-Token` 请求头（景安 Apache 会剥离 `Authorization` 头）。轮询调用 `messages.list?group_id&since_id=N&limit=...`。

## 在线体验

- 应用地址：<https://williamzlj.github.io/smallChat/>
- 接口地址：<https://dz.zhangliangjun.cn/smallChat/api.php?action=ping>

注册需邀请码，请联系维护者获取。

## 许可证

[MIT](./LICENSE)
