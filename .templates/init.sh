#!/bin/bash
# Init Script - 项目启动脚本
# 使用方法: ./init.sh

set -e

echo "🚀 初始化项目..."

# 检查依赖
command -v node >/dev/null 2>&1 || { echo "需要 node"; exit 1; }

# 启动开发服务器
echo "📦 安装依赖..."
npm install

echo "✅ 初始化完成"
echo "🔧 启动开发服务器: npm run dev"
