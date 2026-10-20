# smallChat 部署指南

## 项目结构

```
smallChat/
├── Browser/   # 前端（React + TypeScript + Vite）
└── server/    # 后端（PHP 单入口 api.php）
```

## 前端部署（GitHub Pages）

前端通过 `_publish_ghpages.ps1` 脚本直接调用 GitHub Git Data API 发布到 `gh-pages` 分支，无需依赖 `gh-pages` npm 包。

### 前置条件

- 已安装 Git，且 GitHub 凭据已通过 `git credential fill` 缓存
- GitHub 仓库：`williamzlj/smallChat`
- 已执行 `npm install` 安装依赖

### 部署步骤

```powershell
cd Browser
npm run build
powershell -ExecutionPolicy Bypass -File .\_publish_ghpages.ps1
```

脚本会：
1. 构建产物输出到 `dist/`
2. 通过 GitHub API 将 `dist/` 内所有文件上传为 blob
3. 创建新的 tree/commit 并更新 `gh-pages` 分支引用
4. 清理旧的 `assets/index-*.js/css` 产物

成功后输出 `published commit <sha>`。

### 访问地址

https://williamzlj.github.io/smallChat/

> 注意：PWA 的 Service Worker 会缓存旧版本，更新后需强制刷新（Ctrl+F5）或等待自动更新。

## 后端部署（PHP 虚拟主机）

后端为单文件 `server/api.php`，通过 FTP 上传到主机即可。

### 前置条件

- FTP 凭据（主机商提供）
- PHP 7.4+，支持 PDO（SQLite）

### 部署步骤

将 `server/` 目录下的文件上传到主机网站根目录（如 `WEB/smallChat/`）：

```
api.php          # 主入口
admin.php        # 管理后台
config.php       # 配置（数据库路径、密钥等）
lib/             # 公共库（db.php, helper.php）
data/            # SQLite 数据库目录（需写权限）
uploads/         # 上传文件目录（需写权限）
```

### OPcache 注意

景安等虚拟主机开启了 OPcache，修改 `api.php` 后可能需要等待 1-2 分钟缓存过期才会生效。可通过访问接口验证返回结果是否为新逻辑。

## 本地开发

```powershell
cd Browser
npm run dev      # 启动 Vite 开发服务器（默认 http://localhost:5173）
```

后端开发：直接编辑 `server/api.php`，通过线上 API 或本地 PHP 环境调试。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本到 `dist/` |
| `npm run type-check` | TypeScript 类型检查 |
| `npm run preview` | 预览生产构建 |
