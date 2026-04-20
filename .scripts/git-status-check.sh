#!/bin/bash
# Git Status Check - 每次 agent 回复前必须执行
# 用法: 在完成重要操作后、sessions_yield 前调用

WORKSPACE="$HOME/.openclaw/workspace"

cd "$WORKSPACE" || exit 1

# 检查是否有未提交的更改
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    echo "⚠️  有未提交的代码更改:"
    git status --short
    echo ""
    echo "请执行以下命令提交:"
    echo "  git add -A && git commit -m '描述你的更改'"
    echo ""
    echo "如果暂时不想提交，可以stash:"
    echo "  git stash"
fi

# 列出所有修改的文件
MODIFIED=$(git status --porcelain 2>/dev/null | grep "^.M" | wc -l | tr -d ' ')
UNTRACKED=$(git status --porcelain 2>/dev/null | grep "^??" | wc -l | tr -d ' ')

if [ "$MODIFIED" -gt 0 ] || [ "$UNTRACKED" -gt 0 ]; then
    echo ""
    echo "📊 变更统计: $MODIFIED 个已修改, $UNTRACKED 个未跟踪"
fi
