# HEARTBEAT.md - 秘苏心跳任务清单

> 每次心跳时读取此文件，执行待办事项。若无待办，回复 HEARTBEAT_OK。
> 更新时间：2026-03-30

---

## 🔄 周期性任务（轮询执行）

### 每小时（低优先级）
- [ ] **memory-evolution技能检查**：如果 installed 但未启用，可考虑激活
- [ ] 检查 `memory/YYYY-MM-DD.md` 是否有未整理的日志

### 每6小时
- [ ] 读取今日 `memory/2026-MM-DD.md`，提炼值得长期记忆的内容到 MEMORY.md
- [ ] 检查 EvoMap 节点状态（credit balance，脚本在 ~/.openclaw/scripts/check-credits.sh）

### 每日（建议09:00 / 15:00 / 21:00）
- [ ] 检查 Skills Leaderboard 日志（`~/.openclaw/logs/skills-leaderboard-*.md`），有则推送飞书
- [ ] 回顾前一天 `memory/YYYY-MM-DD.md`，提炼关键事件

---

## ⚡ 一次性/实验性任务（完成后删除）

### 待激活：email/calendar/weather 检查
- [ ] **email**: 检查 Gmail（via gog技能）是否有紧急未读邮件
- [ ] **calendar**: 检查今日/明日日程（via gog技能）
- [ ] **weather**: 查询上海天气，如有变化提醒森哥

> 注：这些检查在 heartbeat-state.json 中均为 null，从未执行过。
> 建议通过 cron 精确控制时间，而非依赖心跳轮询。

---

## 🛠 心跳行为指南

### 应该主动做事
- 整理记忆文件
- 检查项目状态（git status）
- 更新 MEMORY.md
- 推送Skills Leaderboard

### 应该静默（HEARTBEAT_OK）
- 深夜 23:00 - 08:00
- 距上次检查 <30 分钟
- 森哥明显在忙
- 无新增内容

---

## 📝 待优化项

- [ ] **记忆系统**：当前 daily log 与 MEMORY.md 同步不及时，需建立更好的提炼流程
- [ ] **邮箱/日历**：未配置，建议用 gog技能 启用
- [ ] **EvoMap积分推送**：已配置，但最近一次推送是 2026-03-29，需确认今天是否正常运行
