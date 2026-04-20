#!/bin/bash
# Pre-Yield Git Check - Agent 结束前必须执行
# 用法: 在 sessions_yield 前调用此脚本

WORKSPACE="$HOME/.openclaw/workspace"
cd "$WORKSPACE" || exit 1

echo "🔍 Pre-Yield Git Check"
echo "========================"

# 检查未提交更改
MODIFIED=$(git status --porcelain 2>/dev/null | grep -E "^( M|MM)" | wc -l | tr -d ' ')
UNTRACKED=$(git status --porcelain 2>/dev/null | grep "^??" | wc -l | tr -d ' ')

if [ "$MODIFIED" -eq 0 ] && [ "$UNTRACKED" -eq 0 ]; then
    echo "✅ 没有未提交的更改"
    exit 0
fi

echo "⚠️  发现未提交的更改:"
git status --short
echo ""

# 显示差异统计
echo "📊 变更统计:"
echo "  修改: $MODIFIED 文件"
echo "  新增: $UNTRACKED 文件"
echo ""

# 如果有 staged 和 unstaged，显示区别
STAGED=$(git status --porcelain 2>/dev/null | grep -E "^[AM]" | grep -v "^??" | wc -l | tr -d ' ')
if [ "$STAGED" -gt 0 ]; then
    echo "📝 已暂存但未提交 ($STAGED 文件):"
    git diff --cached --stat
fi

echo ""
echo "❌ 不能结束 session - 有未提交的代码"
echo ""
echo "请执行以下命令之一:"
echo "  1. 提交: git add -A && git commit -m '描述'"
echo "  2. 暂存: git stash (临时保存)"
echo "  3. 放弃: git checkout -- . (丢弃更改)"
exit 1
