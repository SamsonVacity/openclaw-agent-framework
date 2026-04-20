# E2E Testing Skill

> 使用 browser 工具做端到端测试验证

## 核心原则（来自 Anthropic）

> Claude 经常不经验证就标记功能为完成。提供浏览器自动化工具后，Claude 能识别并修复仅从代码看不出的 bug。

## 使用场景

### 1. 功能验证
每次完成一个功能后，必须用 browser 工具验证：
1. 打开页面
2. 执行用户操作
3. 验证结果

### 2. Session 开始时验证
每个 session 开始时，先跑一次基础 E2E 测试确认环境正常：
```
browser.start
browser.open → http://localhost:3000
验证基础功能（登录/导航/核心操作）
```

### 3. 回归测试
每次实现新功能前，先跑 E2E 确保基础功能正常。

## 典型流程

```javascript
// 1. 启动浏览器
browser.start({ profile: "openclaw" })

// 2. 打开目标页面
browser.open({ url: "http://localhost:3000" })

// 3. 执行用户操作
browser.act({ kind: "click", ref: "new-chat-btn" })
browser.act({ kind: "type", ref: "input", text: "Hello" })
browser.act({ kind: "press", key: "Enter" })

// 4. 截图验证
browser.screenshot({ fullPage: true })

// 5. 验证结果
// 检查页面内容是否符合预期
```

## 限制说明

⚠️ **Browser 限制：**
- 需要目标服务器运行中（localhost 或公网可访问）
- 浏览器自动化在 headless 环境下可能受限
- 部分 UI 元素可能无法识别（如原生 alert）

## 测试场景示例

### Web App 基础验证
1. 首页加载正常
2. 导航到各页面
3. 用户登录/登出
4. 核心业务操作
5. 响应式布局

### API 服务验证
1. curl 检查健康端点
2. 验证响应格式
3. 关键业务逻辑
