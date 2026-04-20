# Long-Running Agent 工作规范体系

> 基于 Anthropic "Effective Harnesses for Long-Running Agents" (2025-11-26)
> 让 Agent 能够在跨多个上下文窗口的长时任务中保持一致性

---

## 目录

1. [核心理念](#核心理念)
2. [目录结构](#目录结构)
3. [Agent 职责规范](#agent-职责规范)
4. [工作流程](#工作流程)
5. [自动化机制](#自动化机制)
6. [模板文件](#模板文件)
7. [部署指南](#部署指南)

---

## 核心理念

### 两个最大失败模式

| 失败模式 | 描述 | 解决方案 |
|---------|------|---------|
| **贪多嚼不烂** | Agent 总想一口气完成所有功能，导致半途而废 | 每次只做一件事 |
| **过早宣告完成** | Agent 看到有进展就认为可以收工了 | Feature list 验证 |

### 三层机制

1. **约束层** — 强制单任务执行
2. **记忆层** — 跨 session 传递上下文
3. **验证层** — 确保代码可交付

---

## 目录结构

```
~/.openclaw/
├── workspace/
│   ├── AGENTS.md                    # Agent 工作规范（核心）
│   ├── .scripts/
│   │   ├── git-status-check.sh      # Git 状态检查
│   │   └── pre-commit-check.sh      # Session 结束前检查
│   └── .templates/
│       ├── feature-list.json        # 功能清单模板
│       ├── progress.txt             # 进度日志模板
│       └── init.sh                 # 启动脚本模板
├── agents/
│   ├── <agent>/inbox/
│   │   └── PROGRESS.md             # Agent 进度记录
├── cron/
│   ├── daily-git-check.sh           # 每日 Git 检查
│   └── jobs.json                    # Cron 任务（备用）
~/task-list/                         # 任务主列表
    ├── inbox.md
    ├── tasks.md
    ├── projects.md
    ├── waiting.md
    └── log.md
```

---

## Agent 职责规范

### Single-Task 约束（必须遵守）

> 来自 Anthropic 研究：Claude 最大的失败模式是"总想一口气完成所有功能"

**规则：**
1. 每次只做**一件事**
2. 从 `feature-list.json` 选最高优先级未完成功能
3. 完成 → 测试 → 更新 `feature-list` → 更新 `progress` → git commit
4. 禁止同时处理多个功能

**完成信号：**
```
✅ 功能完成: <feature>
📋 剩余: <n> 个
📝 下一步: <next>
```

**禁止事项：**
- ❌ 同时做多个功能
- ❌ 实现一半就结束 session
- ❌ 不测试就标记 pass
- ❌ 不更新 progress 就结束

### Session 生命周期

#### 开始时
1. 读取 `~/.openclaw/agents/<agent>/inbox/PROGRESS.md`
2. 了解当前任务和进度
3. 选择下一个要做的功能

#### 结束时
1. 更新 `PROGRESS.md`
2. 执行 `~/.openclaw/workspace/.scripts/pre-commit-check.sh`
3. 如果有未提交代码：**必须先提交才能结束**

---

## 工作流程

### 完整任务流程

```
1. 森哥下达任务
       ↓
2. Initializer Agent 初始化
   - 创建项目骨架
   - 生成 feature-list.json
   - 生成 progress.txt
   - 第一个 git commit
       ↓
3. Coding Agent 执行（循环）
   - 读取 progress.txt
   - 选择一个功能
   - 实现 + 测试
   - 更新 feature-list (pass: true)
   - 更新 progress.txt
   - git commit
   - 重复直到所有功能完成
       ↓
4. 验证阶段
   - E2E 测试验证
   - 确保代码可交付
```

### Feature List 示例

```json
{
  "project": "my-project",
  "version": "1.0.0",
  "totalFeatures": 3,
  "features": [
    {
      "id": 1,
      "category": "functional",
      "priority": "high",
      "description": "用户可以注册账号",
      "steps": [
        "创建注册表单",
        "添加邮箱验证",
        "保存到数据库"
      ],
      "pass": true,
      "notes": ""
    },
    {
      "id": 2,
      "category": "functional",
      "priority": "high",
      "description": "用户可以登录",
      "steps": [],
      "pass": false,
      "notes": ""
    }
  ]
}
```

### Progress 日志格式

```
# Progress Log

## 当前: #2 - 用户可以登录
状态: 进行中
开始: 2026-04-20 10:00

## 完成的功能
- 2026-04-20 | #1 | ✅ | 用户可以注册账号

## 进行中的功能
- 2026-04-20 | #2 | 🟡 | 用户可以登录 (进度: 30%)

## 待处理
- #3 | 用户可以登出 (优先级: high)
```

---

## 自动化机制

### 每日 Git 检查（Cron）

**配置：**
```bash
0 9 * * * /home/samson/.openclaw/cron/daily-git-check.sh
```

**脚本内容：**
```bash
#!/bin/bash
# 检查 git 状态，发送飞书通知
WORKSPACE="$HOME/.openclaw/workspace"
cd "$WORKSPACE"

MODIFIED=$(git status --porcelain | grep -E "^( M|MM)" | wc -l)
UNTRACKED=$(git status --porcelain | grep "^??" | wc -l)

if [ "$MODIFIED" -eq 0 ] && [ "$UNTRACKED" -eq 0 ]; then
    MSG="✅ 每日 Git 检查\n\n没有未提交的更改，工作区干净。"
else
    DETAILS=$(git status --short)
    MSG="⚠️ 每日 Git 检查\n\n发现未提交的更改:\n${MODIFIED} 个已修改, ${UNTRACKED} 个未跟踪\n\n${DETAILS}"
fi

# 发送飞书通知
timeout 30 openclaw message send \
    --account main \
    --channel feishu \
    --target <森哥飞书ID> \
    --message "$MSG"
```

### Pre-Yield 检查

每次 session 结束前必须执行：
```bash
~/.openclaw/workspace/.scripts/pre-commit-check.sh
```

---

## 模板文件

### feature-list.json

```json
{
  "project": "project-name",
  "version": "1.0.0",
  "created": "YYYY-MM-DD",
  "totalFeatures": 0,
  "features": [
    {
      "id": 1,
      "category": "functional",
      "priority": "high",
      "description": "功能描述",
      "steps": ["步骤1", "步骤2"],
      "pass": false,
      "notes": ""
    }
  ]
}
```

### progress.txt

```
# Progress Log

## 当前: #ID - 功能名
状态: 进行中
开始: YYYY-MM-DD HH:MM

## 完成的功能
- YYYY-MM-DD | #ID | ✅ | 功能名

## 进行中的功能
- YYYY-MM-DD | #ID | 🟡 | 功能名 (进度: x%)

## 待处理
- #ID | 功能名 (优先级: high/medium/low)
```

### init.sh

```bash
#!/bin/bash
set -e
echo "🚀 初始化项目..."
# 检查依赖
command -v node >/dev/null 2>&1 || { echo "需要 node"; exit 1; }
npm install
echo "✅ 初始化完成"
```

---

## 部署指南

### 1. 基础目录

```bash
# 创建目录结构
mkdir -p ~/.openclaw/agents/<agent>/inbox
mkdir -p ~/.openclaw/workspace/.scripts
mkdir -p ~/.openclaw/workspace/.templates
mkdir -p ~/.openclaw/cron
mkdir -p ~/task-list
```

### 2. 复制模板

从本仓库复制：
- `AGENTS.md` → `~/.openclaw/workspace/AGENTS.md`
- `.scripts/*.sh` → `~/.openclaw/workspace/.scripts/`
- `.templates/*` → `~/.openclaw/workspace/.templates/`
- `cron/daily-git-check.sh` → `~/.openclaw/cron/`

### 3. 初始化 Agent Progress

```bash
for agent in main alphax backbase productix aptix scribe imaginix eunoia overseer strategy; do
    cat > ~/.openclaw/agents/$agent/inbox/PROGRESS.md << EOF
# $agent Progress Log
> 跨 session 传递上下文

## 当前任务
- **任务**: (待定)
- **状态**: ⚪ 空闲
- **最后更新**: $(date '+%Y-%m-%d')

## 进度记录

## 待处理事项

## 备注
EOF
done
```

### 4. 配置 Cron

```bash
# 添加每日检查
(crontab -l 2>/dev/null | grep -v "daily-git-check"; \
echo "0 9 * * * /home/samson/.openclaw/cron/daily-git-check.sh >> /tmp/openclaw/daily-git-check.log 2>&1") | crontab -
```

### 5. 初始化 Git

```bash
cd ~/.openclaw/workspace
git init
git add .
git commit -m "feat: 初始化 Long-Running Agent 工作规范"
```

---

## 附录

### 相关资源

- Anthropic 原文：https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- 发布日期：2025-11-26

### 版本历史

| 版本 | 日期 | 变更 |
|-----|------|-----|
| 1.0 | 2026-04-20 | 初始版本 |
