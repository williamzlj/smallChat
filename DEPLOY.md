# GitHub Pages 部署指南

## 📋 前置准备

1. 确保已安装 Git
2. 有 GitHub 账号

## 🚀 部署步骤（已为你配置好！）

你的配置信息：
- GitHub 用户名：`williamzlj`
- 仓库名称：`sudong`
- 访问地址：`https://williamzlj.github.io/sudong`

### 第一步：创建 GitHub 仓库

1. 访问 https://github.com/new
2. 填写仓库名称：`sudong`
3. 选择 Public（公开仓库）
4. **不要**勾选 "Initialize this repository with a README"
5. 点击 "Create repository"

### 第二步：配置本地 Git（在你的电脑上执行）

```bash
# 1. 初始化 Git 仓库
git init

# 2. 添加所有文件
git add .

# 3. 首次提交
git commit -m "Initial commit: Tree Hole Chat with PWA"

# 4. 添加远程仓库
git remote add origin https://github.com/williamzlj/sudong.git

# 5. 推送到 GitHub
git branch -M main
git push -u origin main
```

### 第三步：部署到 GitHub Pages

✅ **vite.config.ts 和 package.json 已配置完成！**

直接运行：

```bash
npm run deploy
```

然后运行：

```bash
npm run deploy
```

**方式二：使用一键部署脚本**

编辑 `package.json` 中的 `homepage` 字段：
```json
"homepage": "https://YOUR_USERNAME.github.io/YOUR_REPO_NAME"
```

编辑 `vite.config.ts` 中的 `repoName` 变量。

然后运行：
```bash
npm run deploy
```

## 📱 访问你的网站

部署完成后，访问：
```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME
```

**注意：** GitHub Pages 可能需要 1-2 分钟才能上线。

## 🔄 后续更新

每次修改代码后，重新部署：

```bash
# 1. 提交你的修改
git add .
git commit -m "Your update message"
git push

# 2. 部署到 GitHub Pages
npm run deploy
```

## ⚙️ 配置说明

### vite.config.ts 配置

- `repoName`：你的 GitHub 仓库名称
- `base`：GitHub Pages 所需的基础路径
- 如果是用户/组织页面（username.github.io），`repoName` 留空

### package.json 脚本说明

- `npm run dev`：启动开发服务器
- `npm run build`：构建生产版本
- `npm run preview`：预览生产版本
- `npm run deploy`：部署到 GitHub Pages
- `npm run type-check`：检查 TypeScript 类型

## 🎯 PWA 注意事项

GitHub Pages 支持 HTTPS，所以 PWA 功能可以正常使用：
- ✅ 添加到主屏幕
- ✅ Service Worker
- ✅ 离线访问（首次访问后）
- ✅ 全屏显示

## 🐛 常见问题

**Q: 部署后页面空白？**
A: 检查 `vite.config.ts` 中的 `repoName` 是否正确设置。

**Q: 图片加载失败？**
A: 确保 `base` 路径配置正确。

**Q: 如何查看部署日志？**
A: 在 GitHub 仓库中，点击 Settings → Pages → 查看部署状态。

## 📝 手动部署备选方案

如果 `gh-pages` 工具遇到问题，可以手动部署：

1. 运行 `npm run build`
2. 在 GitHub 仓库中，进入 Settings → Pages
3. Source: 选择 "Deploy from a branch"
4. Branch: 选择 `gh-pages` 分支（如果没有，先创建）
5. 将 `dist/` 目录的内容上传到该分支
