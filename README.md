# TENKI OUTFIT 天氣穿搭

結合每日天氣和穿搭，利用氣象署一週預報來排定屬於自己的最佳穿著，並且提供氣象的穿搭建議。

## 開發

```bash
npm install
npx expo start          # 開發伺服器（自動去背等原生功能需要 dev build）
npm test                # Jest
bash scripts/regression.sh [--skip-visual]   # tsc + lint + jest + Web 視覺測試
```

## 開發計畫與進度

| 版本 | 內容 | 計畫 |
|------|------|------|
| v1.0.0 | 服裝、每日氣象、穿搭畫布、穿搭建議、備份與還原 | `docs/plans/2026-11-02-tenki-outfit-v1.md` |
| v1.1.0 | 讀取失敗＋重試、建議頁說明缺哪一類、英文單複數、孤兒照片清除、照片範圍快取、可填自己的氣象署授權碼 | `docs/plans/2026-11-03-tenki-outfit-v2.md` |

## 氣象署授權碼

打包時從 `.env.local` 的 `EXPO_PUBLIC_CWA_API_KEY` 編進 App（檔案不進 git）。使用者在設定頁填了自己的授權碼時優先使用；留空則用內建的。
