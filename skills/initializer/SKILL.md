# Initializer Agent Skill

> 用于首次任务初始化，专门负责搭建环境骨架

## 触发场景
- 用户首次给某个 Agent 下达复杂任务
- 新项目/新工作流的第一次启动

## 执行流程

### 1. 创建项目骨架
```
project-name/
├── SPEC.md              # 项目规格说明
├── feature-list.json    # 功能清单（pass: false）
├── progress.txt         # 进度日志
├── init.sh              # 启动脚本
└── README.md            # 项目说明
```

### 2. 解析任务为 Feature List
将用户需求分解为具体的功能点，每个功能标记 `pass: false`。

### 3. 写入初始 git commit
初始化 git 仓库并做第一个 commit。

### 4. 输出标准化上下文
为后续 Coding Agent 准备好：
- SPEC.md（完整需求）
- feature-list.json（功能清单）
- progress.txt（当前进度）
- init.sh（启动命令）

## 输出格式
完成后必须输出：
```
✅ Initializer 完成
📁 项目: <name>
📋 功能数: <n>
🔧 启动: ./init.sh
📝 下一步: <next step>
```
