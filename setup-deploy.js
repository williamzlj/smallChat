#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

console.log('🚀 树洞聊天 - GitHub Pages 部署配置工具')
console.log('='.repeat(50))
console.log()

console.log('📝 使用说明：')
console.log('1. 在 GitHub 上创建仓库')
console.log('2. 修改下面的配置')
console.log('3. 运行 git 命令提交代码')
console.log('4. 运行 npm run deploy 部署')
console.log()

// 你的配置
const exampleConfig = {
  username: 'williamzlj',
  repoName: 'sudong'
}

console.log('💡 配置已完成！请按以下步骤操作：')
console.log()
console.log('✅  vite.config.ts 和 package.json 已自动配置完成')
console.log()
console.log('1️⃣  在 GitHub 上创建仓库（如果还没有）：')
console.log('   访问 https://github.com/new')
console.log(`   仓库名填写：${exampleConfig.repoName}`)
console.log('   选择 Public（公开）')
console.log('   不要勾选 "Initialize this repository"')
console.log('   点击 "Create repository"')
console.log()
console.log('2️⃣  在当前目录执行以下 Git 命令：')
console.log(`
   git init
   git add .
   git commit -m "Initial commit: Tree Hole Chat with PWA"
   git remote add origin https://github.com/${exampleConfig.username}/${exampleConfig.repoName}.git
   git branch -M main
   git push -u origin main
`)
console.log('3️⃣  部署到 GitHub Pages：')
console.log('   npm run deploy')
console.log()
console.log('4️⃣  访问你的网站：')
console.log(`   https://${exampleConfig.username}.github.io/${exampleConfig.repoName}`)
console.log()
console.log('='.repeat(50))
console.log('📖 详细说明请查看 DEPLOY.md 文件')
console.log()
