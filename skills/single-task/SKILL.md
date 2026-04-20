# Single-Task Constraint Skill

> 强制每次只做一件事，避免贪多嚼不烂

## 核心理念（来自 Anthropic）

Anthropic 研究发现：Claude 在长时任务中最大的失败模式是"总想一口气完成所有功能"。

**解决之道：一次只做一件事。**

## 执行规则

### 获取任务
1. 从 feature-list.json 读取未完成的功能
2. 选择**最高优先级**且 `pass: false` 的功能
3. 禁止同时处理多个功能

### 执行任务
1. 明确功能需求（读 SPEC.md）
2. 实现代码
3. 写测试
4. 验证通过
5. 更新 feature-list.json：`pass: true`
6. 更新 progress.txt
7. Git commit

### 完成信号
```
✅ 功能完成: <feature-name>
📋 剩余: <n> 个功能
📝 下一步: <next-feature>
```

## 禁止事项
- ❌ 同时做多个功能
- ❌ 实现一半就结束 session
- ❌ 不写测试就标记 pass
- ❌ 不更新 progress 就结束

## 检查点
每次回复前自问：
1. 我现在在做什么功能？
2. 这个功能完成了吗？
3. 下一步是什么？
