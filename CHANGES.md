# MCSManager 改動紀錄

> 最後更新：2026-02-02

---

## 目前改動

### 1. Terminal.vue - Agent Scope 整合

**位置**：`frontend/src/widgets/instance/Terminal.vue`

- ✅ 新增 Agent Scope 側邊欄 (iframe 嵌入)
- ✅ 新增「AI 助理」按鈕切換顯示/隱藏
- ✅ 新增可拖曳 **Horizontal Splitter**，可調整 Terminal 和 Agent 面板寬度 (280px ~ 600px)

### 2. 響應式佈局

- ✅ 手機版自動隱藏 Agent 側邊欄
- ✅ 小螢幕 (< 1200px) 改為垂直堆疊

---

## 待完成

- [ ] Agent 按鈕圖示優化
- [ ] Splitter 記憶用戶偏好寬度 (localStorage)
- [ ] 深色模式樣式微調

---

## 注意事項

> 此專案為 MCSManager **官方源碼的魔改版**，更新時需注意衝突。
> 改動盡量集中在 `Terminal.vue`，避免動到核心邏輯。
